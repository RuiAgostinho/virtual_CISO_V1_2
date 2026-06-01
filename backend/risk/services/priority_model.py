from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.utils import timezone

from risk.models.priority_model import PRIORITY_FEATURE_CODES, PriorityFeatureSnapshot, PriorityModelConfig


class PriorityModelDependencyError(RuntimeError):
    pass


class PriorityModelDataError(RuntimeError):
    pass


@dataclass
class PriorityTrainingResult:
    artifact_path: str
    model_version: str
    labeled_samples: int
    train_samples: int
    test_samples: int
    holdout_auc: Optional[float]
    holdout_brier: float
    positive_rate: float

    def to_dict(self):
        return {
            "artifact_path": self.artifact_path,
            "model_version": self.model_version,
            "labeled_samples": self.labeled_samples,
            "train_samples": self.train_samples,
            "test_samples": self.test_samples,
            "holdout_auc": self.holdout_auc,
            "holdout_brier": self.holdout_brier,
            "positive_rate": self.positive_rate,
        }


class PriorityModelRuntime:
    POSITIVE_LABELS = {"remediated", "accepted_risk"}
    NEGATIVE_LABELS = {"false_positive"}
    MODULES = {
        "xgboost": "xgboost",
        "shap": "shap",
        "sklearn": "sklearn",
        "numpy": "numpy",
        "joblib": "joblib",
    }

    @classmethod
    def dependency_status(cls) -> Dict[str, bool]:
        import importlib.util

        return {
            name: importlib.util.find_spec(module) is not None
            for name, module in cls.MODULES.items()
        }

    @classmethod
    def ensure_dependencies(cls):
        missing = [name for name, installed in cls.dependency_status().items() if not installed]
        if missing:
            raise PriorityModelDependencyError(
                "Dependencias ML em falta: "
                + ", ".join(missing)
                + ". Instale as dependencias opcionais do modelo antes de treinar/servir XGBoost+SHAP."
            )

    @classmethod
    def build_dataset(cls, minimum_samples: Optional[int] = None, force: bool = False) -> Dict[str, Any]:
        config = PriorityModelConfig.get_config()
        required = minimum_samples or config.min_labeled_outcomes
        snapshots = list(
            PriorityFeatureSnapshot.objects.filter(
                outcome_label__in=tuple(cls.POSITIVE_LABELS | cls.NEGATIVE_LABELS)
            ).order_by("observed_on", "created_at")
        )

        rows = []
        labels = []
        snapshot_ids = []
        for snapshot in snapshots:
            row = cls._row_from_feature_vector(snapshot.feature_vector or {})
            if row is None:
                continue
            rows.append(row)
            labels.append(1 if snapshot.outcome_label in cls.POSITIVE_LABELS else 0)
            snapshot_ids.append(str(snapshot.id))

        if not force and len(rows) < required:
            raise PriorityModelDataError(f"Dataset insuficiente: {len(rows)}/{required} desfechos rotulados.")
        if len(rows) < 4:
            raise PriorityModelDataError("Sao necessarios pelo menos 4 exemplos rotulados para separar treino e holdout.")
        if len(set(labels)) < 2:
            raise PriorityModelDataError("O dataset precisa de pelo menos um exemplo positivo e um negativo.")

        return {
            "X": rows,
            "y": labels,
            "snapshot_ids": snapshot_ids,
            "feature_order": list(PRIORITY_FEATURE_CODES),
        }

    @classmethod
    def train(
        cls,
        minimum_samples: Optional[int] = None,
        test_size: float = 0.25,
        random_state: int = 42,
        activate: bool = False,
        force: bool = False,
    ) -> PriorityTrainingResult:
        cls.ensure_dependencies()

        import joblib
        import numpy as np
        from sklearn.metrics import brier_score_loss, roc_auc_score
        from sklearn.model_selection import train_test_split
        from xgboost import XGBClassifier

        dataset = cls.build_dataset(minimum_samples=minimum_samples, force=force)
        X = np.asarray(dataset["X"], dtype=float)
        y = np.asarray(dataset["y"], dtype=int)

        class_counts = {int(label): int((y == label).sum()) for label in set(y.tolist())}
        stratify = y if min(class_counts.values()) >= 2 else None
        test_size = max(0.1, min(float(test_size), 0.4))

        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=random_state,
            stratify=stratify,
        )

        model = XGBClassifier(
            n_estimators=160,
            max_depth=3,
            learning_rate=0.07,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="binary:logistic",
            eval_metric="logloss",
            random_state=random_state,
        )
        model.fit(X_train, y_train)

        probabilities = model.predict_proba(X_test)[:, 1]
        holdout_auc = roc_auc_score(y_test, probabilities) if len(set(y_test.tolist())) > 1 else None
        holdout_brier = float(brier_score_loss(y_test, probabilities))

        model_version = timezone.now().strftime("xgb-shap-%Y%m%d%H%M%S")
        artifact_dir = Path(settings.MEDIA_ROOT) / "priority_models"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        artifact_path = artifact_dir / f"{model_version}.joblib"
        artifact = {
            "model": model,
            "feature_order": dataset["feature_order"],
            "trained_at": timezone.now().isoformat(),
            "label_definition": {
                "positive": sorted(cls.POSITIVE_LABELS),
                "negative": sorted(cls.NEGATIVE_LABELS),
            },
            "metrics": {
                "holdout_auc": holdout_auc,
                "holdout_brier": holdout_brier,
                "positive_rate": float(y.mean()),
                "train_samples": int(len(y_train)),
                "test_samples": int(len(y_test)),
            },
        }
        joblib.dump(artifact, artifact_path)

        config = PriorityModelConfig.get_config()
        config.active_model_version = model_version
        config.artifact_path = str(artifact_path)
        config.trained_at = timezone.now()
        config.holdout_auc = Decimal(str(round(holdout_auc, 3))) if holdout_auc is not None else None
        config.holdout_brier = Decimal(str(round(holdout_brier, 3)))
        config.last_training_summary = {
            "labeled_samples": int(len(y)),
            "train_samples": int(len(y_train)),
            "test_samples": int(len(y_test)),
            "positive_rate": round(float(y.mean()), 4),
            "feature_order": dataset["feature_order"],
            "label_definition": artifact["label_definition"],
        }
        if activate:
            config.mode = PriorityModelConfig.Mode.XGBOOST_SHAP
        config.save()

        return PriorityTrainingResult(
            artifact_path=str(artifact_path),
            model_version=model_version,
            labeled_samples=int(len(y)),
            train_samples=int(len(y_train)),
            test_samples=int(len(y_test)),
            holdout_auc=float(holdout_auc) if holdout_auc is not None else None,
            holdout_brier=holdout_brier,
            positive_rate=float(y.mean()),
        )

    @classmethod
    def predict(cls, feature_vector: Dict[str, float], factors: List[Dict[str, Any]]) -> Dict[str, Any]:
        cls.ensure_dependencies()

        import joblib
        import numpy as np

        config = PriorityModelConfig.get_config()
        artifact_path = Path(config.artifact_path or "")
        if not artifact_path.exists():
            raise PriorityModelDataError("Artefacto XGBoost+SHAP indisponivel.")

        artifact = joblib.load(artifact_path)
        feature_order = artifact.get("feature_order") or list(PRIORITY_FEATURE_CODES)
        row = [float(feature_vector.get(code, 0.0)) for code in feature_order]
        X = np.asarray([row], dtype=float)
        model = artifact["model"]
        probability = float(model.predict_proba(X)[0][1])

        shap_values = cls._shap_values(model, X)
        contribution_breakdown = cls._contribution_breakdown(
            feature_order,
            shap_values,
            probability,
            factors,
        )
        return {
            "priority_score": round(max(0.0, min(probability * 100.0, 100.0)), 2),
            "model_version": config.active_model_version,
            "contribution_breakdown": contribution_breakdown,
        }

    @classmethod
    def _row_from_feature_vector(cls, feature_vector: Dict[str, Any]) -> Optional[List[float]]:
        row = []
        for code in PRIORITY_FEATURE_CODES:
            value = feature_vector.get(code)
            if value is None:
                return None
            try:
                row.append(float(value))
            except (TypeError, ValueError):
                return None
        return row

    @staticmethod
    def _shap_values(model, X):
        import shap

        explainer = shap.TreeExplainer(model)
        values = explainer.shap_values(X)
        if isinstance(values, list):
            values = values[-1]
        return [float(value) for value in values[0]]

    @staticmethod
    def _contribution_breakdown(feature_order, shap_values, probability, factors):
        factors_by_code = {factor["code"]: factor for factor in factors}
        total_impact = sum(abs(value) for value in shap_values) or 1.0
        score = max(0.0, min(probability * 100.0, 100.0))
        items = []
        for code, shap_value in zip(feature_order, shap_values):
            original = factors_by_code.get(code, {})
            direction = "aumentou" if shap_value >= 0 else "reduziu"
            impact = (abs(shap_value) / total_impact) * score
            items.append(
                {
                    "code": code,
                    "label": original.get("label", code),
                    "raw_value": f"{original.get('raw_value', 'n/d')} | SHAP {shap_value:+.4f}",
                    "normalized_score": original.get("normalized_score", 0.0),
                    "weight": round(abs(shap_value), 4),
                    "contribution": round(impact, 2),
                    "source": "XGBoost + SHAP",
                    "explanation": (
                        f"Valor SHAP {shap_value:+.4f}: esta feature {direction} "
                        "a probabilidade aprendida pelo modelo interno."
                    ),
                }
            )
        return items
