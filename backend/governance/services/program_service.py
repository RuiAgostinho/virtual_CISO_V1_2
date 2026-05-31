from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from company.models import CompanyProfile
from governance.models import (
    Control,
    ControlAssessment,
    DecisionRecord,
    EvidenceItem,
    EvidenceLink,
    Framework,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceException,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
    RegulatoryContext,
)
from governance.services.security_posture_drift import SecurityPostureDriftService
from governance.services.workbench_service import GovernanceWorkbenchService
from risk.models import (
    Asset,
    AssetClassificationReview,
    AssetDiscoveryFinding,
    AssetVulnerability,
)


class ProgramService:
    """CISO programme spine composed from existing operational signals."""

    STAGES = [
        {
            "id": "context",
            "order": 0,
            "label": "Contexto",
            "summary": "Organização, âmbito regulatório, frameworks e apetite de risco.",
            "href": "/onboarding",
            "threshold": 0.75,
        },
        {
            "id": "know",
            "order": 1,
            "label": "Conhecer",
            "summary": "Inventário oficial, responsáveis, tipificação e classificação validada.",
            "href": "/assets/onboarding",
            "threshold": 0.9,
        },
        {
            "id": "assess",
            "order": 2,
            "label": "Avaliar",
            "summary": "Postura por framework, mappings e maturidade.",
            "href": "/catalogs/frameworks",
            "threshold": 0.8,
        },
        {
            "id": "prioritize",
            "order": 3,
            "label": "Priorizar",
            "summary": "Risco e gaps ordenados por impacto para decisão.",
            "href": "/risks/prioritization",
            "threshold": 0.8,
        },
        {
            "id": "treat",
            "order": 4,
            "label": "Tratar",
            "summary": "Ações, mecanismos e controlos para fechar lacunas.",
            "href": "/governance/action-plan",
            "threshold": 0.8,
        },
        {
            "id": "prove",
            "order": 5,
            "label": "Provar",
            "summary": "Evidência, rationale e rastreabilidade auditável.",
            "href": "/governance/traceability",
            "threshold": 0.85,
        },
        {
            "id": "monitor",
            "order": 6,
            "label": "Vigiar",
            "summary": "Drift, exceções, revisões vencidas e continuidade.",
            "href": "/governance/drift",
            "threshold": 0.85,
        },
        {
            "id": "report",
            "order": 7,
            "label": "Reportar",
            "summary": "Decisões registadas e leitura executiva do progresso.",
            "href": "/mission-control?mode=executive",
            "threshold": 0.8,
        },
    ]

    ITEM_STAGE = {
        "organization_context_incomplete": "context",
        "regulatory_scope_pending": "context",
        "framework_scope_empty": "context",
        "pending_asset_findings": "know",
        "assets_without_owner": "know",
        "assets_without_type": "know",
        "assets_without_valid_classification": "know",
        "policies_without_owner": "know",
        "pending_mappings": "assess",
        "draft_mappings": "assess",
        "framework_maturity_attention": "assess",
        "maturity_assessments_missing": "assess",
        "maturity_not_started": "assess",
        "controls_without_framework": "assess",
        "low_coverage_frameworks": "assess",
        "critical_high_vulnerabilities": "prioritize",
        "drift_requires_prioritization": "prioritize",
        "policies_without_controls": "treat",
        "documents_without_controls": "treat",
        "controls_without_mechanisms": "treat",
        "mechanisms_without_evidence": "treat",
        "missing_rationale": "prove",
        "low_confidence_mappings": "prove",
        "expired_evidence": "prove",
        "overdue_documents": "monitor",
        "pending_exceptions": "monitor",
        "expired_exceptions": "monitor",
        "expiring_exceptions": "monitor",
        "decision_register_empty": "report",
    }

    CATEGORY_STAGE = {
        "validation": "assess",
        "documents": "treat",
        "controls": "treat",
        "mechanisms": "treat",
        "evidence": "prove",
        "exceptions": "monitor",
        "scores": "assess",
    }

    SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

    TRACEABILITY_TYPE_BY_ITEM = {
        "pending_asset_findings": "asset",
        "assets_without_owner": "asset",
        "assets_without_type": "asset",
        "assets_without_valid_classification": "asset",
        "policies_without_owner": "policy",
        "policies_without_controls": "policy",
        "documents_without_controls": "governance_document",
        "overdue_documents": "governance_document",
        "controls_without_mechanisms": "internal_control",
        "controls_without_framework": "internal_control",
        "mechanisms_without_evidence": "mechanism",
        "expired_evidence": "evidence_item",
        "pending_exceptions": "risk",
        "expired_exceptions": "risk",
        "expiring_exceptions": "risk",
        "pending_mappings": "internal_control",
        "draft_mappings": "internal_control",
        "missing_rationale": "internal_control",
        "low_confidence_mappings": "internal_control",
        "low_coverage_frameworks": "framework",
        "critical_high_vulnerabilities": "asset",
        "drift_requires_prioritization": "framework_control",
        "framework_maturity_attention": "framework",
        "maturity_assessments_missing": "framework_control",
        "maturity_not_started": "framework_control",
    }

    SUPPORTED_TRACEABILITY_TYPES = {
        "framework",
        "framework_control",
        "internal_control",
        "mechanism",
        "evidence_item",
        "policy",
        "governance_document",
        "asset",
        "risk",
    }

    @classmethod
    def overview(cls):
        workbench = GovernanceWorkbenchService.overview()
        drift = SecurityPostureDriftService.overview()
        signals = {
            "context": cls._context_signal(),
            "assets": cls._asset_signal(),
            "maturity": cls._maturity_signal(),
            "risk": cls._risk_signal(),
            "drift": cls._drift_signal(drift),
            "report": cls._report_signal(),
        }
        work_items = [
            *cls._context_work_items(signals["context"]),
            *cls._asset_work_items(signals["assets"]),
            *cls._maturity_work_items(signals["maturity"]),
            *cls._risk_work_items(signals["risk"]),
            *cls._drift_work_items(signals["drift"]),
            *workbench["work_items"],
            *cls._report_work_items(signals["report"]),
        ]
        enriched_items = cls._enrich_work_items(work_items, workbench)
        stages = cls._build_stages(enriched_items, workbench, signals)
        current_focus = next(
            (stage for stage in stages if stage["status"] in {"not_started", "in_progress", "attention"}),
            stages[-1] if stages else None,
        )
        next_actions = cls._next_actions(enriched_items, current_focus)

        return {
            "generated_at": timezone.now().isoformat(),
            "source": "program_service",
            "risk_appetite": signals["context"]["risk_appetite"],
            "current_focus": current_focus,
            "next_action": next_actions[0] if next_actions else None,
            "next_actions": next_actions,
            "stages": stages,
            "work_items": enriched_items,
            "signals": signals,
            "drift": drift,
            "workbench": workbench,
        }

    @classmethod
    def _context_signal(cls):
        profile = CompanyProfile.objects.order_by("created_at").first()
        regulatory = RegulatoryContext.objects.select_related("organization").order_by("created_at").first()
        active_frameworks = Framework.objects.filter(is_active=True).count()
        preferred_frameworks = list(getattr(profile, "preferred_frameworks", []) or []) if profile else []
        checks = {
            "profile": bool(profile and profile.legal_name),
            "onboarding": bool(profile and profile.onboarding_completed_at),
            "framework_scope": bool(preferred_frameworks or active_frameworks),
            "regulatory_scope": bool(regulatory and regulatory.nis2_classification != "Pending"),
        }
        completed = sum(1 for value in checks.values() if value)
        return {
            "checks": checks,
            "completed_checks": completed,
            "total_checks": len(checks),
            "active_frameworks": active_frameworks,
            "preferred_frameworks": preferred_frameworks,
            "nis2_classification": regulatory.nis2_classification if regulatory else "Pending",
            "risk_appetite": getattr(profile, "risk_appetite", "balanced") if profile else "balanced",
            "completeness": round(completed / max(len(checks), 1), 2),
        }

    @classmethod
    def _asset_signal(cls):
        total_assets = Asset.objects.count()
        validated_asset_ids = (
            AssetClassificationReview.objects.filter(
                is_current=True,
                status=AssetClassificationReview.Status.VALIDATED,
            )
            .values_list("asset_id", flat=True)
            .distinct()
        )
        owner_present = Q(business_owner__isnull=False) | (Q(owner__isnull=False) & ~Q(owner=""))
        official_assets = (
            Asset.objects.filter(
                status="Active",
                asset_type__isnull=False,
                id__in=validated_asset_ids,
            )
            .filter(owner_present)
        )
        official_count = official_assets.count()
        pending_findings = AssetDiscoveryFinding.objects.filter(
            status=AssetDiscoveryFinding.Status.NEW,
        ).count()
        onboarding_assets = Asset.objects.exclude(id__in=official_assets.values("id")).count()
        without_owner = Asset.objects.exclude(owner_present).count()
        without_type = Asset.objects.filter(asset_type__isnull=True).count()
        without_valid_classification = Asset.objects.exclude(id__in=validated_asset_ids).count()
        denominator = total_assets + pending_findings
        completeness = round(official_count / denominator, 2) if denominator else 0
        return {
            "total_assets": total_assets,
            "official_assets": official_count,
            "onboarding_assets": onboarding_assets,
            "pending_findings": pending_findings,
            "without_owner": without_owner,
            "without_type": without_type,
            "without_valid_classification": without_valid_classification,
            "completeness": completeness,
        }

    @classmethod
    def _risk_signal(cls):
        active = AssetVulnerability.objects.filter(status__in=["Open", "In remediation"])
        critical_high = active.filter(vulnerability__severity__in=["Critical", "High"]).count()
        critical = active.filter(vulnerability__severity="Critical").count()
        high = active.filter(vulnerability__severity="High").count()
        return {
            "active_occurrences": active.count(),
            "critical_high": critical_high,
            "critical": critical,
            "high": high,
            "completeness": 1 if critical_high == 0 else max(0.1, round(1 - min(critical_high / 25, 0.9), 2)),
        }

    @classmethod
    def _maturity_signal(cls):
        active_controls = Control.objects.select_related("framework").filter(status=Control.Status.ACTIVE)
        assessments = ControlAssessment.objects.select_related("control", "control__framework").all()
        total_controls = active_controls.count()
        total_assessments = assessments.count()
        implemented = assessments.filter(
            implementation_status__in=[
                ControlAssessment.ImplementationStatus.IMPLEMENTED,
                ControlAssessment.ImplementationStatus.OPTIMIZED,
            ]
        ).count()
        partial = assessments.filter(implementation_status=ControlAssessment.ImplementationStatus.PARTIAL).count()
        planned = assessments.filter(implementation_status=ControlAssessment.ImplementationStatus.PLANNED).count()
        not_started = assessments.filter(implementation_status=ControlAssessment.ImplementationStatus.NOT_STARTED).count()
        controls_without_assessment = active_controls.exclude(assessments__isnull=False).count()
        score = 0
        if total_assessments:
            score = round(((implemented + 0.5 * partial + 0.25 * planned) / total_assessments) * 100, 1)
        completeness = round(score / 100, 2) if total_assessments else 0 if total_controls else 1

        frameworks = []
        for framework in Framework.objects.filter(is_active=True).order_by("code", "version"):
            framework_controls = active_controls.filter(framework=framework)
            framework_assessments = assessments.filter(control__framework=framework)
            framework_total_controls = framework_controls.count()
            framework_total_assessments = framework_assessments.count()
            framework_implemented = framework_assessments.filter(
                implementation_status__in=[
                    ControlAssessment.ImplementationStatus.IMPLEMENTED,
                    ControlAssessment.ImplementationStatus.OPTIMIZED,
                ]
            ).count()
            framework_partial = framework_assessments.filter(
                implementation_status=ControlAssessment.ImplementationStatus.PARTIAL
            ).count()
            framework_planned = framework_assessments.filter(
                implementation_status=ControlAssessment.ImplementationStatus.PLANNED
            ).count()
            framework_not_started = framework_assessments.filter(
                implementation_status=ControlAssessment.ImplementationStatus.NOT_STARTED
            ).count()
            framework_controls_without_assessment = framework_controls.exclude(assessments__isnull=False).count()
            framework_score = 0
            if framework_total_assessments:
                framework_score = round(
                    (
                        (
                            framework_implemented
                            + 0.5 * framework_partial
                            + 0.25 * framework_planned
                        )
                        / framework_total_assessments
                    )
                    * 100,
                    1,
                )
            framework_completeness = (
                round(framework_score / 100, 2)
                if framework_total_assessments
                else 0
                if framework_total_controls
                else 1
            )
            attention_count = framework_controls_without_assessment + framework_not_started
            frameworks.append(
                {
                    "framework": cls._framework_payload(framework),
                    "total_controls": framework_total_controls,
                    "total_assessments": framework_total_assessments,
                    "controls_without_assessment": framework_controls_without_assessment,
                    "implemented": framework_implemented,
                    "partial": framework_partial,
                    "planned": framework_planned,
                    "not_started": framework_not_started,
                    "score": framework_score,
                    "completeness": framework_completeness,
                    "attention_count": attention_count,
                    "has_attention": bool(
                        framework_total_controls
                        and (
                            framework_controls_without_assessment > 0
                            or framework_not_started > 0
                            or framework_score < 80
                        )
                    ),
                }
            )

        frameworks_with_attention = [item for item in frameworks if item["has_attention"]]
        worst_framework = (
            sorted(
                frameworks_with_attention,
                key=lambda item: (
                    -item["attention_count"],
                    item["score"],
                    item["framework"]["code"],
                    item["framework"].get("version") or "",
                ),
            )[0]
            if frameworks_with_attention
            else None
        )

        return {
            "total_controls": total_controls,
            "total_assessments": total_assessments,
            "controls_without_assessment": controls_without_assessment,
            "implemented": implemented,
            "partial": partial,
            "planned": planned,
            "not_started": not_started,
            "score": score,
            "completeness": completeness,
            "frameworks": frameworks,
            "frameworks_with_attention": len(frameworks_with_attention),
            "worst_framework": worst_framework,
        }

    @staticmethod
    def _drift_signal(drift):
        metrics = drift.get("metrics", {})
        total_events = int(metrics.get("total_events") or 0)
        critical = int(metrics.get("critical") or 0)
        high = int(metrics.get("high") or 0)
        severity = "critical" if critical else "high" if high else "medium" if total_events else "info"
        return {
            "total_events": total_events,
            "critical": critical,
            "high": high,
            "medium": int(metrics.get("medium") or 0),
            "low": int(metrics.get("low") or 0),
            "control_regressions": int(metrics.get("control_regressions") or 0),
            "asset_exposure_regressions": int(metrics.get("asset_exposure_regressions") or 0),
            "new_vulnerabilities": int(metrics.get("new_vulnerabilities") or 0),
            "framework_mapping_gaps": int(metrics.get("framework_mapping_gaps") or 0),
            "severity": severity,
            "completeness": 1 if total_events == 0 else max(0.05, round(1 - min(total_events / 20, 0.95), 2)),
        }

    @staticmethod
    def _report_signal():
        decisions = DecisionRecord.objects.count()
        recent_decisions = DecisionRecord.objects.filter(decided_at__isnull=False).count()
        return {
            "decision_records": decisions,
            "decided_records": recent_decisions,
            "completeness": 1 if decisions else 0,
        }

    @classmethod
    def _context_work_items(cls, signal):
        return [
            cls._work_item(
                "organization_context_incomplete",
                "context",
                "medium" if signal["completeness"] < 0.75 else "info",
                "Contexto institucional incompleto",
                "O ciclo do CISO precisa de organização, âmbito regulatório, frameworks e apetite de risco explícitos.",
                max(signal["total_checks"] - signal["completed_checks"], 0),
                "/onboarding",
                "Completar contexto",
            ),
            cls._work_item(
                "framework_scope_empty",
                "context",
                "medium" if signal["active_frameworks"] == 0 and not signal["preferred_frameworks"] else "info",
                "Frameworks em âmbito por definir",
                "Sem frameworks no âmbito, a etapa Avaliar não consegue medir postura nem gaps.",
                1 if signal["active_frameworks"] == 0 and not signal["preferred_frameworks"] else 0,
                "/catalogs/frameworks",
                "Definir frameworks",
            ),
            cls._work_item(
                "regulatory_scope_pending",
                "context",
                "medium" if signal["nis2_classification"] == "Pending" else "info",
                "Âmbito regulatório pendente",
                "A classificação NIS2 ainda está pendente e deve ser fechada antes da leitura executiva.",
                1 if signal["nis2_classification"] == "Pending" else 0,
                "/onboarding",
                "Fechar âmbito",
            ),
        ]

    @classmethod
    def _asset_work_items(cls, signal):
        return [
            cls._work_item(
                "pending_asset_findings",
                "assets",
                "medium" if signal["pending_findings"] else "info",
                "Findings de ativos por validar",
                "Descobertas ainda não revistas não devem entrar no inventário oficial.",
                signal["pending_findings"],
                "/assets/onboarding?tab=findings",
                "Validar findings",
            ),
            cls._work_item(
                "assets_without_owner",
                "assets",
                "high" if signal["without_owner"] else "info",
                "Ativos sem responsável",
                "Um ativo sem responsável não pode avançar para inventário oficial nem sustentar decisões auditáveis.",
                signal["without_owner"],
                "/assets/onboarding?tab=assets&filtro=sem-responsavel",
                "Atribuir responsável",
            ),
            cls._work_item(
                "assets_without_type",
                "assets",
                "high" if signal["without_type"] else "info",
                "Ativos sem tipo definido",
                "A tipificação é necessária para classificar o ativo e relacioná-lo com riscos e controlos.",
                signal["without_type"],
                "/assets/onboarding?tab=assets&filtro=sem-tipo",
                "Tipificar ativos",
            ),
            cls._work_item(
                "assets_without_valid_classification",
                "assets",
                "high" if signal["without_valid_classification"] else "info",
                "Ativos sem classificação validada",
                "A classificação guiada com justificação humana é a porta de entrada para rastreabilidade fiável.",
                signal["without_valid_classification"],
                "/assets/onboarding?tab=assets&filtro=sem-classificacao",
                "Validar classificação",
            ),
        ]

    @classmethod
    def _risk_work_items(cls, signal):
        return [
            cls._work_item(
                "critical_high_vulnerabilities",
                "risk",
                "critical" if signal["critical"] else "high" if signal["critical_high"] else "info",
                "Vulnerabilidades críticas/altas por priorizar",
                "Exposição ativa de alto impacto deve ser tratada antes de ações de menor risco.",
                signal["critical_high"],
                "/risks/prioritization",
                "Priorizar risco",
            )
        ]

    @classmethod
    def _maturity_work_items(cls, signal):
        worst_framework = signal.get("worst_framework")
        worst_framework_id = (worst_framework or {}).get("framework", {}).get("id")
        maturity_href = f"/maturity?framework={worst_framework_id}" if worst_framework_id else "/maturity"
        not_started_href = (
            f"{maturity_href}&implementation_status=not_started"
            if worst_framework_id
            else "/maturity?implementation_status=not_started"
        )
        framework_target = (
            {
                "type": "framework",
                "id": str(worst_framework_id),
                "label": cls._label_from_dict(worst_framework["framework"]),
            }
            if worst_framework_id
            else None
        )
        return [
            cls._work_item(
                "framework_maturity_attention",
                "scores",
                "high" if signal["frameworks_with_attention"] else "info",
                "Frameworks com maturidade incompleta",
                "A etapa Avaliar compara transversalmente todas as frameworks em âmbito e destaca onde a postura precisa de decisão.",
                signal["frameworks_with_attention"],
                maturity_href,
                "Avaliar framework",
                traceability_target=framework_target,
            ),
            cls._work_item(
                "maturity_assessments_missing",
                "scores",
                "high" if signal["controls_without_assessment"] else "info",
                "Controlos sem avaliação de maturidade",
                "A etapa Avaliar precisa de uma leitura de maturidade por controlo para sustentar postura e lacunas.",
                signal["controls_without_assessment"],
                maturity_href,
                "Avaliar maturidade",
                traceability_target=cls._maturity_missing_control_target(worst_framework_id),
            ),
            cls._work_item(
                "maturity_not_started",
                "scores",
                "medium" if signal["not_started"] else "info",
                "Avaliações de maturidade por iniciar",
                "Controlos com avaliação inicial por iniciar deixam a postura incompleta mesmo quando a framework está no catálogo.",
                signal["not_started"],
                not_started_href,
                "Completar avaliações",
                traceability_target=cls._maturity_not_started_control_target(worst_framework_id),
            ),
        ]

    @classmethod
    def _drift_work_items(cls, signal):
        return [
            cls._work_item(
                "drift_requires_prioritization",
                "drift",
                signal["severity"],
                "Drift a reabrir priorização",
                "Foram detetadas regressões ou alterações recentes; a vigilância contínua deve realimentar a decisão de prioridade.",
                signal["total_events"],
                "/governance/drift",
                "Priorizar drift",
            )
        ]

    @classmethod
    def _report_work_items(cls, signal):
        return [
            cls._work_item(
                "decision_register_empty",
                "report",
                "medium" if signal["decision_records"] == 0 else "info",
                "Decisões ainda sem registo formal",
                "A tese defende decisão auditável; decisões sem registo reduzem a força demonstrável do programa.",
                1 if signal["decision_records"] == 0 else 0,
                "/decision-records",
                "Registar decisões",
            )
        ]

    @staticmethod
    def _work_item(identifier, category, severity, title, description, count, href, action_label, **extra):
        return {
            "id": identifier,
            "category": category,
            "severity": severity,
            "title": title,
            "description": description,
            "count": count,
            "href": href,
            "action_label": action_label,
            **extra,
        }

    @classmethod
    def _enrich_work_items(cls, work_items, workbench):
        stage_lookup = {stage["id"]: stage for stage in cls.STAGES}
        enriched = []
        for item in work_items:
            stage_id = cls.ITEM_STAGE.get(item["id"], cls.CATEGORY_STAGE.get(item["category"], "assess"))
            stage = stage_lookup[stage_id]
            traceability_target = item.get("traceability_target") or cls._traceability_target(item["id"], workbench)
            enriched.append(
                {
                    **item,
                    "stage": stage_id,
                    "stage_label": stage["label"],
                    "stage_order": stage["order"],
                    "decision_rationale": cls._decision_rationale(item, stage),
                    "traceability_target": traceability_target,
                    "traceability_href": cls._traceability_href(item, traceability_target),
                }
            )
        return sorted(
            enriched,
            key=lambda item: (
                item["stage_order"],
                cls.SEVERITY_ORDER.get(item["severity"], 5),
                -item["count"],
                item["title"],
            ),
        )

    @classmethod
    def _build_stages(cls, work_items, workbench, signals):
        items_by_stage = {
            stage["id"]: [item for item in work_items if item["stage"] == stage["id"]]
            for stage in cls.STAGES
        }
        stages = []
        for definition in cls.STAGES:
            stage_id = definition["id"]
            items = items_by_stage[stage_id]
            attention_items = [item for item in items if item["count"] > 0 and item["severity"] != "info"]
            attention_count = sum(item["count"] for item in attention_items)
            worst_severity = cls._worst_severity(attention_items)
            completeness = cls._stage_completeness(stage_id, attention_count, workbench, signals)
            status = cls._stage_status(completeness, attention_count, definition["threshold"])
            primary_action = cls._primary_action(attention_items)
            stages.append(
                {
                    **definition,
                    "completeness": completeness,
                    "status": status,
                    "attention_count": attention_count,
                    "severity": worst_severity,
                    "blocking": False,
                    "work_item_ids": [item["id"] for item in items],
                    "primary_href": primary_action["href"] if primary_action else definition["href"],
                    "primary_action_label": primary_action["action_label"] if primary_action else "Abrir etapa",
                }
            )

        first_focus = next(
            (stage for stage in stages if stage["status"] in {"not_started", "in_progress", "attention"}),
            None,
        )
        if first_focus:
            for stage in stages:
                stage["blocking"] = (
                    stage["order"] <= first_focus["order"]
                    and stage["status"] in {"not_started", "in_progress", "attention"}
                )
        return stages

    @classmethod
    def _stage_completeness(cls, stage_id, attention_count, workbench, signals):
        if stage_id == "context":
            return signals["context"]["completeness"]
        if stage_id == "know":
            return signals["assets"]["completeness"]
        if stage_id == "assess":
            coverage = [
                item["coverage"] / 100
                for item in workbench.get("framework_coverage", [])
                if item.get("total_controls", 0) > 0
            ]
            maturity = signals["maturity"]["completeness"]
            if coverage:
                return round((sum(coverage) / len(coverage) + maturity) / 2, 2)
            return maturity if signals["maturity"]["total_controls"] else 0 if attention_count else 1
        if stage_id == "prioritize":
            return min(signals["risk"]["completeness"], signals["drift"]["completeness"])
        if stage_id == "report":
            return signals["report"]["completeness"]
        return cls._attention_completeness(attention_count)

    @staticmethod
    def _attention_completeness(attention_count):
        if attention_count <= 0:
            return 1
        return max(0.05, round(1 - min(attention_count / 30, 0.95), 2))

    @staticmethod
    def _stage_status(completeness, attention_count, threshold):
        if completeness <= 0:
            return "not_started"
        if attention_count > 0:
            return "attention"
        if completeness >= threshold:
            return "complete"
        return "in_progress"

    @classmethod
    def _worst_severity(cls, items):
        if not items:
            return "info"
        return min(items, key=lambda item: cls.SEVERITY_ORDER.get(item["severity"], 5))["severity"]

    @classmethod
    def _primary_action(cls, items):
        if not items:
            return None
        return sorted(
            items,
            key=lambda item: (
                cls.SEVERITY_ORDER.get(item["severity"], 5),
                -item["count"],
                item["title"],
            ),
        )[0]

    @classmethod
    def _next_actions(cls, work_items, current_focus):
        actionable = [item for item in work_items if item["count"] > 0 and item["severity"] != "info"]
        focus_id = current_focus["id"] if current_focus else None
        return sorted(
            actionable,
            key=lambda item: (
                0 if item["stage"] == focus_id else 1,
                item["stage_order"],
                cls.SEVERITY_ORDER.get(item["severity"], 5),
                -item["count"],
                item["title"],
            ),
        )[:10]

    @staticmethod
    def _decision_rationale(item, stage):
        if item["count"] <= 0:
            return f"A etapa {stage['label']} nao tem bloqueios relevantes neste sinal."
        return (
            f"Prioridade da etapa {stage['label']}: {item['count']} registo(s) afetam "
            f"o progresso do programa. {item['description']}"
        )

    @classmethod
    def _traceability_href(cls, item, traceability_target=None):
        if traceability_target:
            return (
                f"/governance/traceability?type={traceability_target['type']}"
                f"&id={traceability_target['id']}"
            )
        entity_type = cls.TRACEABILITY_TYPE_BY_ITEM.get(item["id"])
        if not entity_type:
            return "/governance/traceability"
        return f"/governance/traceability?type={entity_type}"

    @classmethod
    def _traceability_target(cls, item_id, workbench):
        today = timezone.localdate()
        owner_present = Q(business_owner__isnull=False) | (Q(owner__isnull=False) & ~Q(owner=""))

        if item_id == "pending_asset_findings":
            finding = (
                AssetDiscoveryFinding.objects.select_related("asset")
                .filter(status=AssetDiscoveryFinding.Status.NEW, asset__isnull=False)
                .order_by("-created_at")
                .first()
            )
            if finding and finding.asset:
                return cls._target("asset", finding.asset, f"{cls._label_for(finding.asset)} - finding {finding}")

        if item_id == "assets_without_owner":
            asset = Asset.objects.exclude(owner_present).order_by("name").first()
            return cls._target("asset", asset)

        if item_id == "assets_without_type":
            asset = Asset.objects.filter(asset_type__isnull=True).order_by("name").first()
            return cls._target("asset", asset)

        if item_id == "assets_without_valid_classification":
            validated_asset_ids = (
                AssetClassificationReview.objects.filter(
                    is_current=True,
                    status=AssetClassificationReview.Status.VALIDATED,
                )
                .values_list("asset_id", flat=True)
                .distinct()
            )
            asset = Asset.objects.exclude(id__in=validated_asset_ids).order_by("name").first()
            return cls._target("asset", asset)

        if item_id == "critical_high_vulnerabilities":
            occurrence = (
                AssetVulnerability.objects.select_related("asset", "vulnerability")
                .filter(status__in=["Open", "In remediation"], vulnerability__severity__in=["Critical", "High"])
                .order_by("-vulnerability__cvss_score", "vulnerability__cve_id")
                .first()
            )
            if occurrence:
                label = cls._label_for(occurrence.asset)
                if occurrence.vulnerability:
                    label = f"{label} - {occurrence.vulnerability.cve_id}"
                return cls._target("asset", occurrence.asset, label)

        if item_id == "drift_requires_prioritization":
            return cls._drift_traceability_target()

        if item_id == "maturity_assessments_missing":
            assessed_control_ids = ControlAssessment.objects.values_list("control_id", flat=True).distinct()
            control = (
                Control.objects.select_related("framework")
                .filter(status=Control.Status.ACTIVE)
                .exclude(id__in=assessed_control_ids)
                .order_by("framework__code", "code")
                .first()
            )
            return cls._target("framework_control", control)

        if item_id == "maturity_not_started":
            assessment = (
                ControlAssessment.objects.select_related("control", "control__framework")
                .filter(implementation_status=ControlAssessment.ImplementationStatus.NOT_STARTED)
                .order_by("control__framework__code", "control__code")
                .first()
            )
            return cls._target("framework_control", assessment.control if assessment else None)

        if item_id == "policies_without_owner":
            policy = Policy.objects.filter(Q(owner__isnull=True) | Q(owner="")).order_by("code", "title").first()
            return cls._target("policy", policy)

        if item_id == "policies_without_controls":
            policy_ids = (
                PolicyInternalControl.objects.exclude(
                    validation_status__in=GovernanceWorkbenchService.INACTIVE_MAPPING_STATUSES
                )
                .values_list("policy_id", flat=True)
                .distinct()
            )
            policy = Policy.objects.exclude(id__in=policy_ids).order_by("code", "title").first()
            return cls._target("policy", policy)

        if item_id == "documents_without_controls":
            document_ids = (
                GovernanceDocumentControl.objects.exclude(
                    validation_status__in=GovernanceWorkbenchService.INACTIVE_MAPPING_STATUSES
                )
                .values_list("document_id", flat=True)
                .distinct()
            )
            document = GovernanceDocument.objects.filter(is_active=True).exclude(id__in=document_ids).order_by("title").first()
            return cls._target("governance_document", document)

        if item_id == "overdue_documents":
            document = GovernanceDocument.objects.filter(is_active=True, review_date__lt=today).order_by("review_date", "title").first()
            return cls._target("governance_document", document)

        if item_id == "controls_without_mechanisms":
            control_ids = (
                InternalControlMechanism.objects.exclude(
                    validation_status__in=GovernanceWorkbenchService.INACTIVE_MAPPING_STATUSES
                )
                .values_list("internal_control_id", flat=True)
                .distinct()
            )
            control = InternalControl.objects.filter(is_active=True).exclude(id__in=control_ids).order_by("code").first()
            return cls._target("internal_control", control)

        if item_id == "controls_without_framework":
            control_ids = (
                InternalControlFrameworkMapping.objects.filter(validation_status="approved")
                .values_list("internal_control_id", flat=True)
                .distinct()
            )
            control = InternalControl.objects.filter(is_active=True).exclude(id__in=control_ids).order_by("code").first()
            return cls._target("internal_control", control)

        if item_id == "mechanisms_without_evidence":
            mechanism_ids = GovernanceWorkbenchService._mechanism_ids_with_valid_evidence(today)
            mechanism = Mechanism.objects.exclude(id__in=mechanism_ids).order_by("title").first()
            return cls._target("mechanism", mechanism)

        if item_id == "expired_evidence":
            evidence = (
                EvidenceItem.objects.filter(is_active=True)
                .filter(Q(status="expired") | Q(valid_until__lt=today))
                .order_by("valid_until", "title")
                .first()
            )
            return cls._target("evidence_item", evidence)

        if item_id == "low_coverage_frameworks":
            return cls._low_coverage_framework_target(workbench)

        if item_id in {"pending_mappings", "draft_mappings", "missing_rationale", "low_confidence_mappings"}:
            return cls._mapping_traceability_target(item_id)

        if item_id in {"pending_exceptions", "expired_exceptions", "expiring_exceptions"}:
            return cls._exception_traceability_target(item_id, today)

        return None

    @classmethod
    def _drift_traceability_target(cls):
        drift = SecurityPostureDriftService.overview()
        event = cls._first_drift_event(drift)
        if not event:
            return None
        event_type = event.get("type")
        if event_type in {"control_regression", "framework_mapping_gap"}:
            return {
                "type": "framework_control",
                "id": str(event.get("control_id")),
                "label": cls._drift_event_label(event),
            }
        if event_type in {"asset_exposure_regression", "new_vulnerability"}:
            return {
                "type": "asset",
                "id": str(event.get("asset_id")),
                "label": cls._drift_event_label(event),
            }
        return None

    @classmethod
    def _first_drift_event(cls, drift):
        events = []
        for key in (
            "control_regressions",
            "asset_exposure_regressions",
            "new_vulnerabilities",
            "framework_mapping_gaps",
        ):
            events.extend(drift.get(key, []))
        if not events:
            return None
        return sorted(
            events,
            key=lambda item: (
                cls.SEVERITY_ORDER.get(item.get("severity"), 5),
                -float(item.get("impact_score") or 0),
            ),
        )[0]

    @classmethod
    def _drift_event_label(cls, event):
        if event.get("type") == "new_vulnerability":
            return f"{event.get('asset_name', 'Ativo')} - {event.get('cve_id', 'vulnerabilidade nova')}"
        if event.get("asset_name"):
            return event["asset_name"]
        framework = event.get("framework") or {}
        framework_code = framework.get("code")
        control_code = event.get("control_code")
        title = event.get("control_title")
        return " - ".join(str(part) for part in (framework_code, control_code, title) if part)

    @classmethod
    def _mapping_traceability_target(cls, item_id):
        if item_id == "pending_mappings":
            predicate = Q(validation_status="pending_review")
        elif item_id == "draft_mappings":
            predicate = Q(validation_status="draft")
        elif item_id == "missing_rationale":
            predicate = ~Q(validation_status__in=GovernanceWorkbenchService.INACTIVE_MAPPING_STATUSES) & (
                Q(rationale__isnull=True) | Q(rationale="")
            )
        elif item_id == "low_confidence_mappings":
            predicate = ~Q(validation_status__in=GovernanceWorkbenchService.INACTIVE_MAPPING_STATUSES) & Q(
                confidence_score__gt=0,
                confidence_score__lt=60,
            )
        else:
            return None

        for model, select_related, target_attr in (
            (PolicyInternalControl, ("internal_control",), "internal_control"),
            (GovernanceDocumentControl, ("internal_control",), "internal_control"),
            (InternalControlFrameworkMapping, ("internal_control",), "internal_control"),
            (InternalControlMechanism, ("internal_control",), "internal_control"),
        ):
            mapping = model.objects.select_related(*select_related).filter(predicate).order_by("created_at").first()
            if mapping:
                return cls._target("internal_control", getattr(mapping, target_attr, None))

        evidence_link = (
            EvidenceLink.objects.select_related("evidence_item")
            .filter(predicate)
            .order_by("created_at")
            .first()
        )
        return cls._evidence_link_target(evidence_link)

    @classmethod
    def _exception_traceability_target(cls, item_id, today):
        if item_id == "pending_exceptions":
            exception = (
                GovernanceException.objects.filter(
                    approval_status=GovernanceException.ApprovalStatus.PENDING_REVIEW
                )
                .order_by("valid_until", "title")
                .first()
            )
        elif item_id == "expired_exceptions":
            exception = (
                GovernanceException.objects.filter(
                    Q(approval_status=GovernanceException.ApprovalStatus.EXPIRED)
                    | Q(approval_status=GovernanceException.ApprovalStatus.APPROVED, valid_until__lt=today)
                )
                .order_by("valid_until", "title")
                .first()
            )
        elif item_id == "expiring_exceptions":
            exception = (
                GovernanceWorkbenchService._active_exceptions(today)
                .filter(valid_until__isnull=False, valid_until__lte=today + timedelta(days=30))
                .order_by("valid_until", "title")
                .first()
            )
        else:
            return None

        if not exception:
            return None
        if exception.target_type in cls.SUPPORTED_TRACEABILITY_TYPES:
            return {
                "type": exception.target_type,
                "id": str(exception.target_id),
                "label": exception.title,
            }
        if exception.target_type == "internal_control_mechanism":
            link = (
                InternalControlMechanism.objects.select_related("internal_control")
                .filter(id=exception.target_id)
                .first()
            )
            return cls._target("internal_control", getattr(link, "internal_control", None), exception.title)
        return None

    @classmethod
    def _evidence_link_target(cls, evidence_link):
        if not evidence_link:
            return None
        if evidence_link.target_type in cls.SUPPORTED_TRACEABILITY_TYPES:
            target = getattr(evidence_link, "target", None)
            return {
                "type": evidence_link.target_type,
                "id": str(evidence_link.target_id),
                "label": cls._label_for(target) or f"{evidence_link.target_type}:{evidence_link.target_id}",
            }
        return cls._target("evidence_item", evidence_link.evidence_item)

    @classmethod
    def _low_coverage_framework_target(cls, workbench):
        for item in workbench.get("framework_coverage", []):
            if item.get("total_controls", 0) <= 0 or item.get("coverage", 100) >= 60:
                continue
            framework = item.get("framework") or {}
            framework_id = framework.get("id")
            if framework_id:
                return {
                    "type": "framework",
                    "id": str(framework_id),
                    "label": cls._label_from_dict(framework),
                }
        return None

    @classmethod
    def _maturity_missing_control_target(cls, framework_id=None):
        assessed_control_ids = ControlAssessment.objects.values_list("control_id", flat=True).distinct()
        controls = Control.objects.select_related("framework").filter(status=Control.Status.ACTIVE)
        if framework_id:
            controls = controls.filter(framework_id=framework_id)
        control = (
            controls.exclude(id__in=assessed_control_ids)
            .order_by("framework__code", "framework__version", "code")
            .first()
        )
        if not control and framework_id:
            return cls._maturity_missing_control_target()
        return cls._target("framework_control", control)

    @classmethod
    def _maturity_not_started_control_target(cls, framework_id=None):
        assessments = ControlAssessment.objects.select_related("control", "control__framework").filter(
            implementation_status=ControlAssessment.ImplementationStatus.NOT_STARTED
        )
        if framework_id:
            assessments = assessments.filter(control__framework_id=framework_id)
        assessment = assessments.order_by("control__framework__code", "control__framework__version", "control__code").first()
        if not assessment and framework_id:
            return cls._maturity_not_started_control_target()
        return cls._target("framework_control", assessment.control if assessment else None)

    @classmethod
    def _target(cls, entity_type, obj, label=None):
        if not obj:
            return None
        return {
            "type": entity_type,
            "id": str(obj.id),
            "label": label or cls._label_for(obj),
        }

    @staticmethod
    def _framework_payload(framework):
        return {
            "id": str(framework.id),
            "code": framework.code,
            "name": framework.name,
            "version": framework.version,
        }

    @staticmethod
    def _label_for(obj):
        if not obj:
            return ""
        code = getattr(obj, "code", "") or getattr(obj, "cve_id", "")
        name = getattr(obj, "name", "") or getattr(obj, "title", "")
        if code and name:
            return f"{code} - {name}"
        return name or code or str(obj)

    @staticmethod
    def _label_from_dict(data):
        code = data.get("code") or data.get("slug")
        name = data.get("name") or data.get("title") or data.get("version")
        if code and name:
            return f"{code} - {name}"
        return name or code or str(data.get("id", ""))
