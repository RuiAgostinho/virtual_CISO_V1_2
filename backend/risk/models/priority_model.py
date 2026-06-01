import uuid
import importlib.util

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


PRIORITY_FEATURE_CODES = [
    "cvss",
    "epss",
    "kev",
    "asset_criticality",
    "exposure",
    "business_value",
    "dependency",
    "mechanism_gap",
    "evidence_gap",
    "regulatory_relevance",
    "residual_risk_gap",
]


class PriorityModelConfig(models.Model):
    class Mode(models.TextChoices):
        EXPLAINABLE_WEIGHTED = "explainable_weighted", "Ponderado explicavel"
        XGBOOST_SHAP = "xgboost_shap", "XGBoost + SHAP interno"

    singleton = models.BooleanField(default=True, unique=True, editable=False)
    mode = models.CharField(
        max_length=40,
        choices=Mode.choices,
        default=Mode.EXPLAINABLE_WEIGHTED,
    )
    feature_store_enabled = models.BooleanField(default=True)
    shadow_mode_enabled = models.BooleanField(default=False)
    min_labeled_outcomes = models.PositiveIntegerField(default=200)
    min_review_cycles = models.PositiveSmallIntegerField(default=2)
    active_model_version = models.CharField(max_length=80, blank=True)
    artifact_path = models.CharField(max_length=500, blank=True)
    trained_at = models.DateTimeField(null=True, blank=True)
    holdout_auc = models.DecimalField(max_digits=5, decimal_places=3, null=True, blank=True)
    holdout_brier = models.DecimalField(max_digits=5, decimal_places=3, null=True, blank=True)
    last_training_summary = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuracao do modelo de priorizacao"
        verbose_name_plural = "Configuracoes do modelo de priorizacao"

    def __str__(self):
        return f"Modelo de priorizacao: {self.mode}"

    @classmethod
    def get_config(cls):
        config = cls.objects.first()
        if not config:
            config = cls.objects.create()
        return config

    @property
    def supported_features(self):
        return list(PRIORITY_FEATURE_CODES)

    def readiness_snapshot(self):
        dependency_status = {
            "xgboost": importlib.util.find_spec("xgboost") is not None,
            "shap": importlib.util.find_spec("shap") is not None,
            "sklearn": importlib.util.find_spec("sklearn") is not None,
            "numpy": importlib.util.find_spec("numpy") is not None,
            "joblib": importlib.util.find_spec("joblib") is not None,
        }
        snapshots = PriorityFeatureSnapshot.objects.all()
        feature_snapshots = snapshots.count()
        terminal_labels = PriorityFeatureSnapshot.TERMINAL_OUTCOME_LABELS
        labeled_outcomes = (
            snapshots.filter(outcome_label__in=terminal_labels)
            .values("occurrence_key")
            .distinct()
            .count()
        )
        review_cycles = snapshots.values("observed_on").distinct().count()
        has_active_artifact = bool(self.active_model_version and self.artifact_path)
        has_quality_metrics = self.holdout_auc is not None and self.holdout_brier is not None

        blockers = []
        if labeled_outcomes < self.min_labeled_outcomes:
            blockers.append(
                {
                    "code": "insufficient_labeled_outcomes",
                    "message": (
                        f"Faltam desfechos rotulados: {labeled_outcomes}/"
                        f"{self.min_labeled_outcomes}."
                    ),
                }
            )
        if review_cycles < self.min_review_cycles:
            blockers.append(
                {
                    "code": "insufficient_review_cycles",
                    "message": f"Faltam ciclos temporais: {review_cycles}/{self.min_review_cycles}.",
                }
            )
        if not has_active_artifact:
            blockers.append(
                {
                    "code": "missing_model_artifact",
                    "message": "Ainda nao existe artefacto XGBoost+SHAP treinado e aprovado.",
                }
            )
        if not has_quality_metrics:
            blockers.append(
                {
                    "code": "missing_quality_metrics",
                    "message": "Ainda nao existem metricas de validacao holdout (AUC/Brier).",
                }
            )
        missing_dependencies = [name for name, installed in dependency_status.items() if not installed]
        if missing_dependencies:
            blockers.append(
                {
                    "code": "missing_ml_dependencies",
                    "message": "Dependencias ML em falta: " + ", ".join(missing_dependencies) + ".",
                }
            )

        return {
            "feature_snapshots": feature_snapshots,
            "labeled_outcomes": labeled_outcomes,
            "review_cycles": review_cycles,
            "required_labeled_outcomes": self.min_labeled_outcomes,
            "required_review_cycles": self.min_review_cycles,
            "has_active_artifact": has_active_artifact,
            "has_quality_metrics": has_quality_metrics,
            "ready": not blockers,
            "blockers": blockers,
            "supported_features": self.supported_features,
            "current_ml_signal": "EPSS",
            "internal_model": "xgboost_shap",
            "dependency_status": dependency_status,
        }

    def is_xgboost_ready(self):
        return self.readiness_snapshot()["ready"]

    def clean(self):
        super().clean()
        if self.mode == self.Mode.XGBOOST_SHAP and not self.is_xgboost_ready():
            blockers = "; ".join(item["message"] for item in self.readiness_snapshot()["blockers"])
            raise ValidationError({"mode": f"O XGBoost+SHAP interno ainda nao pode ser ativado. {blockers}"})

    def save(self, *args, **kwargs):
        if not self.pk:
            existing = PriorityModelConfig.objects.first()
            if existing:
                self.pk = existing.pk
        self.full_clean()
        super().save(*args, **kwargs)


class PriorityFeatureSnapshot(models.Model):
    TERMINAL_OUTCOME_LABELS = ("remediated", "accepted_risk", "false_positive")

    OUTCOME_LABEL_CHOICES = [
        ("open", "Aberto"),
        ("in_remediation", "Em remediacao"),
        ("remediated", "Remediado"),
        ("accepted_risk", "Risco aceite"),
        ("false_positive", "Falso positivo"),
        ("unknown", "Desconhecido"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    occurrence = models.ForeignKey(
        "risk.AssetVulnerability",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="priority_feature_snapshots",
    )
    occurrence_key = models.CharField(max_length=80, db_index=True)
    asset = models.ForeignKey(
        "risk.Asset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="priority_feature_snapshots",
    )
    asset_key = models.CharField(max_length=80, blank=True)
    vulnerability = models.ForeignKey(
        "risk.Vulnerability",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="priority_feature_snapshots",
    )
    vulnerability_key = models.CharField(max_length=80, blank=True)
    observed_on = models.DateField(default=timezone.localdate, db_index=True)
    model_mode = models.CharField(max_length=40, default=PriorityModelConfig.Mode.EXPLAINABLE_WEIGHTED)
    estimator_key = models.CharField(max_length=60, default="weighted_v1")
    feature_vector = models.JSONField(default=dict, blank=True)
    score_snapshot = models.JSONField(default=dict, blank=True)
    contribution_breakdown = models.JSONField(default=list, blank=True)
    priority_score = models.FloatField(default=0.0)
    risk_score = models.FloatField(default=0.0)
    remediation_score = models.FloatField(default=0.0)
    outcome_status = models.CharField(max_length=40, blank=True)
    outcome_label = models.CharField(max_length=60, choices=OUTCOME_LABEL_CHOICES, default="unknown")
    outcome_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Snapshot de features de priorizacao"
        verbose_name_plural = "Snapshots de features de priorizacao"
        constraints = [
            models.UniqueConstraint(
                fields=["occurrence_key", "observed_on", "model_mode"],
                name="unique_priority_snapshot_per_day",
            )
        ]
        indexes = [
            models.Index(fields=["model_mode", "observed_on"]),
            models.Index(fields=["outcome_label", "observed_on"]),
        ]

    def __str__(self):
        return f"{self.occurrence_key} ({self.model_mode}) em {self.observed_on}"

    @staticmethod
    def outcome_from_occurrence(occurrence):
        status_value = getattr(occurrence, "status", "") or ""
        label_map = {
            "Open": "open",
            "In remediation": "in_remediation",
            "Mitigated": "remediated",
            "Resolved": "remediated",
            "Accepted risk": "accepted_risk",
            "False positive": "false_positive",
        }
        outcome_label = label_map.get(status_value, "unknown")
        outcome_at = None
        if outcome_label in PriorityFeatureSnapshot.TERMINAL_OUTCOME_LABELS:
            outcome_at = getattr(occurrence, "resolved_at", None) or timezone.now()
        return {
            "outcome_status": status_value,
            "outcome_label": outcome_label,
            "outcome_at": outcome_at,
        }
