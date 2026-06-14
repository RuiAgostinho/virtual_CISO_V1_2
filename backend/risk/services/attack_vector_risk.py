from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db.models import Prefetch, Q
from django.utils import timezone

from risk.models import Asset, AssetExposureSnapshot, AssetVulnerability
from risk.models.priority_model import PRIORITY_FEATURE_CODES, PriorityModelConfig
from risk.services.prioritization import DEFAULT_RISK_WEIGHTS


ACTIVE_OCCURRENCE_STATUSES = {"Open", "In remediation", "Accepted risk"}

CRITICALITY_SCOREMAP = {
    "critical": 1.0,
    "high": 0.8,
    "medium": 0.5,
    "low": 0.25,
    "very low": 0.1,
}

IMPLEMENTATION_COVERAGE = {
    "implemented_evidenced": 1.0,
    "implemented": 0.75,
    "partially_implemented": 0.45,
    "planned": 0.25,
    "not_implemented": 0.0,
    "not_applicable": 0.0,
}

ATTACK_VECTOR_ML_WARNING = (
    "O score oficial deste cenario continua a ser o motor semiquantitativo explicavel. "
    "A projecao XGBoost+SHAP e apresentada apenas em shadow mode porque o artefacto interno "
    "foi treinado para priorizacao de vulnerabilidades, nao para risco agregado por vetor de ataque."
)


@dataclass(frozen=True)
class AttackVectorDefinition:
    id: str
    label: str
    description: str
    category: str
    control_keywords: tuple[str, ...]
    service_keywords: tuple[str, ...] = ()
    ports: tuple[int, ...] = ()
    vulnerability_keywords: tuple[str, ...] = ()
    asset_keywords: tuple[str, ...] = ()
    min_cvss: float | None = None
    min_epss: float | None = None
    kev_relevant: bool = False
    applies_to_all: bool = False
    baseline_likelihood: float = 0.15
    impact_focus: tuple[str, ...] = ("criticality", "business_value", "dependency")


ATTACK_VECTOR_CATALOG: tuple[AttackVectorDefinition, ...] = (
    AttackVectorDefinition(
        id="ransomware",
        label="Ransomware",
        description="Compromisso com cifragem, indisponibilidade e extorsao operacional.",
        category="malware_extortion",
        control_keywords=("backup", "restauro", "restore", "edr", "xdr", "antimalware", "incidente", "continuidade"),
        service_keywords=("rdp", "smb", "ssh", "vpn", "remote desktop"),
        ports=(22, 445, 3389, 5900),
        vulnerability_keywords=("ransomware", "remote code execution", "rce", "privilege escalation"),
        min_epss=0.35,
        kev_relevant=True,
        applies_to_all=True,
        baseline_likelihood=0.25,
        impact_focus=("criticality", "availability", "business_value", "dependency"),
    ),
    AttackVectorDefinition(
        id="phishing_credentials",
        label="Phishing e compromisso de credenciais",
        description="Roubo de credenciais, acesso inicial por engenharia social e abuso de contas.",
        category="identity",
        control_keywords=("mfa", "iam", "identidade", "credencial", "password", "formacao", "awareness", "email"),
        service_keywords=("smtp", "imap", "pop3", "webmail", "mail"),
        ports=(25, 110, 143, 465, 587, 993, 995),
        applies_to_all=True,
        baseline_likelihood=0.30,
        impact_focus=("criticality", "confidentiality", "business_value"),
    ),
    AttackVectorDefinition(
        id="exposed_services",
        label="Exploracao de servicos expostos",
        description="Exploracao de servicos acessiveis externamente ou com superficie de ataque elevada.",
        category="external_exposure",
        control_keywords=("hardening", "waf", "firewall", "segmentacao", "patch", "vulnerability", "scanner"),
        service_keywords=("http", "https", "rdp", "ssh", "vpn", "ftp", "smb"),
        ports=(21, 22, 80, 443, 445, 3389, 8443),
        min_cvss=7.0,
        min_epss=0.20,
        kev_relevant=True,
        baseline_likelihood=0.25,
        impact_focus=("criticality", "business_value", "dependency"),
    ),
    AttackVectorDefinition(
        id="critical_vulnerability_exploitation",
        label="Exploracao de vulnerabilidades criticas",
        description="Exploracao de CVEs com severidade, EPSS ou KEV relevantes no contexto da organizacao.",
        category="vulnerability",
        control_keywords=("patch", "vulnerability", "scanner", "gestao de vulnerabilidades", "hardening"),
        min_cvss=8.0,
        min_epss=0.20,
        kev_relevant=True,
        applies_to_all=True,
        baseline_likelihood=0.20,
        impact_focus=("criticality", "business_value", "dependency"),
    ),
    AttackVectorDefinition(
        id="privilege_abuse",
        label="Abuso de privilegios",
        description="Uso indevido de contas privilegiadas, elevacao de privilegios e falhas de segregacao.",
        category="identity",
        control_keywords=("pam", "privilegio", "privilege", "rbac", "least privilege", "mfa", "acesso"),
        vulnerability_keywords=("privilege escalation", "elevation of privilege"),
        applies_to_all=True,
        baseline_likelihood=0.20,
        impact_focus=("criticality", "confidentiality", "integrity"),
    ),
    AttackVectorDefinition(
        id="lateral_movement",
        label="Movimento lateral",
        description="Propagacao interna apos compromisso inicial atraves de protocolos administrativos ou partilhas.",
        category="post_compromise",
        control_keywords=("segmentacao", "edr", "xdr", "logging", "siem", "hardening", "admin"),
        service_keywords=("smb", "rdp", "winrm", "ssh", "remote"),
        ports=(22, 135, 139, 445, 5985, 5986, 3389),
        applies_to_all=True,
        baseline_likelihood=0.18,
        impact_focus=("criticality", "dependency", "business_value"),
    ),
    AttackVectorDefinition(
        id="data_exfiltration",
        label="Exfiltracao de dados",
        description="Extracao nao autorizada de informacao sensivel ou regulada.",
        category="data",
        control_keywords=("dlp", "cifragem", "encryption", "logging", "siem", "classificacao", "acesso"),
        service_keywords=("ftp", "sftp", "http", "https", "database", "sql"),
        ports=(21, 22, 80, 443, 1433, 1521, 3306, 5432),
        applies_to_all=True,
        baseline_likelihood=0.18,
        impact_focus=("criticality", "confidentiality", "business_value"),
    ),
    AttackVectorDefinition(
        id="ddos_unavailability",
        label="Indisponibilidade e DDoS",
        description="Indisponibilidade de servicos criticos por ataque de disponibilidade ou saturacao.",
        category="availability",
        control_keywords=("ddos", "continuidade", "resiliencia", "waf", "capacity", "monitorizacao"),
        service_keywords=("http", "https", "dns", "api"),
        ports=(53, 80, 443, 8080, 8443),
        baseline_likelihood=0.16,
        impact_focus=("criticality", "availability", "business_value"),
    ),
    AttackVectorDefinition(
        id="backup_recovery_failure",
        label="Falha de backup e recuperacao",
        description="Incapacidade de recuperar servicos ou dados apos incidente tecnico ou malicioso.",
        category="resilience",
        control_keywords=("backup", "restauro", "restore", "recuperacao", "recovery", "continuidade", "drp"),
        asset_keywords=("backup", "storage", "nas", "repository"),
        applies_to_all=True,
        baseline_likelihood=0.18,
        impact_focus=("criticality", "availability", "business_value", "dependency"),
    ),
    AttackVectorDefinition(
        id="supplier_compromise",
        label="Compromisso de fornecedor",
        description="Impacto de terceiros, fornecedores ou dependencias externas no risco da organizacao.",
        category="third_party",
        control_keywords=("fornecedor", "supplier", "third party", "terceiro", "contrato", "sla", "cadeia"),
        asset_keywords=("supplier", "fornecedor", "third party", "external"),
        applies_to_all=True,
        baseline_likelihood=0.14,
        impact_focus=("criticality", "business_value", "dependency"),
    ),
    AttackVectorDefinition(
        id="misconfiguration",
        label="Ma configuracao e hardening insuficiente",
        description="Exposicao causada por configuracoes inseguras, servicos desnecessarios ou hardening incompleto.",
        category="configuration",
        control_keywords=("hardening", "configuracao", "configuration", "baseline", "patch", "secure"),
        service_keywords=("telnet", "ftp", "http", "smb", "rdp"),
        ports=(21, 23, 80, 445, 3389),
        vulnerability_keywords=("misconfiguration", "default password", "weak configuration"),
        applies_to_all=True,
        baseline_likelihood=0.20,
        impact_focus=("criticality", "integrity", "business_value"),
    ),
    AttackVectorDefinition(
        id="detection_response_gap",
        label="Falha de detecao e resposta",
        description="Incapacidade de detetar, triar, conter e aprender com incidentes de seguranca.",
        category="operations",
        control_keywords=("siem", "logging", "monitorizacao", "deteccao", "incident", "incidente", "soc", "playbook"),
        applies_to_all=True,
        baseline_likelihood=0.16,
        impact_focus=("criticality", "availability", "integrity"),
    ),
)


class AttackVectorRiskService:
    @classmethod
    def overview(cls, horizon_days: int = 30) -> dict[str, Any]:
        horizon_days = cls._safe_horizon(horizon_days)
        context = cls._build_context()
        vectors = [cls._evaluate_vector(definition, context, horizon_days) for definition in ATTACK_VECTOR_CATALOG]
        vectors.sort(key=lambda item: item["score"], reverse=True)

        critical_count = sum(1 for item in vectors if item["level"] == "critical")
        high_count = sum(1 for item in vectors if item["level"] == "high")
        average_score = round(sum(item["score"] for item in vectors) / max(len(vectors), 1), 1)

        return {
            "generated_at": timezone.now().isoformat(),
            "horizon_days": horizon_days,
            "methodology": cls._methodology(),
            "summary": {
                "total_vectors": len(vectors),
                "critical": critical_count,
                "high": high_count,
                "average_score": average_score,
                "top_vector": vectors[0] if vectors else None,
            },
            "vectors": vectors,
        }

    @classmethod
    def detail(cls, vector_id: str, horizon_days: int = 30) -> dict[str, Any] | None:
        horizon_days = cls._safe_horizon(horizon_days)
        definition = cls._definition(vector_id)
        if not definition:
            return None
        context = cls._build_context()
        result = cls._evaluate_vector(definition, context, horizon_days, include_detail=True)
        result["methodology"] = cls._methodology()
        return result

    @staticmethod
    def catalog() -> list[dict[str, Any]]:
        return [
            {
                "id": definition.id,
                "label": definition.label,
                "description": definition.description,
                "category": definition.category,
                "control_keywords": list(definition.control_keywords),
                "service_keywords": list(definition.service_keywords),
                "ports": list(definition.ports),
            }
            for definition in ATTACK_VECTOR_CATALOG
        ]

    @staticmethod
    def _methodology() -> dict[str, Any]:
        return {
            "name": "Attack vector risk v1",
            "type": "semiquantitative_explainable",
            "formula": "score = sqrt(probability * impact * exposure * mitigation_gap) * 100",
            "formula_pt": "Risco do cenário = √(Probabilidade × Impacto × Exposição × Lacuna de mitigação) × 100",
            "scale": "0-100",
            "dimensions": [
                "probability",
                "impact",
                "exposure",
                "mitigation_gap",
                "confidence",
            ],
            "dimension_explanations": {
                "probability": {
                    "label": "Probabilidade prospetiva",
                    "summary": (
                        "Estima a plausibilidade do vetor no horizonte escolhido combinando ameaça técnica, "
                        "serviços expostos, fragilidade de governação e uma probabilidade base do cenário."
                    ),
                    "calculation": (
                        "45% sinal de ameaça (CVSS, EPSS e CISA KEV), 25% sinal de serviços expostos, "
                        "15% lacuna de mitigação e 15% probabilidade base do vetor."
                    ),
                    "signals": [
                        "CVSS e EPSS das vulnerabilidades relevantes",
                        "Presença em CISA KEV",
                        "Portas e serviços detetados no último snapshot técnico",
                        "Cobertura de controlos, mecanismos e evidências",
                        "Baseline próprio de cada vetor de ataque",
                    ],
                },
                "impact": {
                    "label": "Impacto organizacional",
                    "summary": (
                        "Mede o efeito provável do cenário nos ativos mais relevantes para a organização, "
                        "não apenas a severidade técnica da vulnerabilidade."
                    ),
                    "calculation": (
                        "Calcula o impacto de cada ativo pelas dimensões aplicáveis ao vetor e usa a média "
                        "dos 10 ativos mais relevantes."
                    ),
                    "signals": [
                        "Criticidade do ativo",
                        "Confidencialidade, integridade e disponibilidade quando relevantes",
                        "Valor de negócio",
                        "Dependência sistémica do ativo",
                    ],
                },
                "exposure": {
                    "label": "Exposição técnica",
                    "summary": "Representa a superfície exposta do conjunto de ativos afetados.",
                    "calculation": "Combina a exposição classificada no ativo com o último snapshot técnico de portas e serviços.",
                },
                "mitigation_gap": {
                    "label": "Lacuna de mitigação",
                    "summary": "Representa a parte do risco que ainda não está coberta por controlos, mecanismos e evidências válidas.",
                    "calculation": "É calculada como 1 - cobertura mitigadora.",
                },
            },
            "note": (
                "A confianca nao reduz o score; e apresentada em separado para evitar falsa precisao "
                "quando faltam dados, evidencias ou historico."
            ),
            "predictive_extension": (
                "O XGBoost+SHAP interno, quando pronto, corre apenas como shadow model sobre uma projecao "
                "das features de priorizacao. Nao substitui o score oficial do cenario."
            ),
        }

    @staticmethod
    def _safe_horizon(horizon_days: int) -> int:
        try:
            value = int(horizon_days)
        except (TypeError, ValueError):
            value = 30
        return max(1, min(value, 365))

    @staticmethod
    def _definition(vector_id: str) -> AttackVectorDefinition | None:
        normalized = str(vector_id or "").strip().lower()
        return next((definition for definition in ATTACK_VECTOR_CATALOG if definition.id == normalized), None)

    @classmethod
    def _build_context(cls) -> dict[str, Any]:
        assets = list(
            Asset.objects.exclude(status="Retired")
            .select_related("category", "asset_type", "environment", "deployment_type", "business_owner", "technical_owner")
            .prefetch_related(
                Prefetch(
                    "exposure_snapshots",
                    queryset=AssetExposureSnapshot.objects.order_by("-captured_at"),
                    to_attr="_attack_vector_exposure_snapshots",
                )
            )
        )
        occurrences = list(
            AssetVulnerability.objects.select_related("asset", "vulnerability", "software")
            .filter(status__in=ACTIVE_OCCURRENCE_STATUSES)
            .exclude(asset__status="Retired")
        )
        occurrences_by_asset: dict[str, list[AssetVulnerability]] = {}
        for occurrence in occurrences:
            occurrences_by_asset.setdefault(str(occurrence.asset_id), []).append(occurrence)
        priority_model_config = PriorityModelConfig.get_config()

        return {
            "assets": assets,
            "occurrences": occurrences,
            "occurrences_by_asset": occurrences_by_asset,
            "priority_model_config": priority_model_config,
            "priority_model_readiness": priority_model_config.readiness_snapshot(),
        }

    @classmethod
    def _evaluate_vector(
        cls,
        definition: AttackVectorDefinition,
        context: dict[str, Any],
        horizon_days: int,
        include_detail: bool = False,
    ) -> dict[str, Any]:
        matched_assets: list[dict[str, Any]] = []
        matched_occurrences: list[AssetVulnerability] = []

        for asset in context["assets"]:
            asset_occurrences = context["occurrences_by_asset"].get(str(asset.id), [])
            relevant_occurrences = [
                occurrence for occurrence in asset_occurrences if cls._occurrence_matches(definition, occurrence)
            ]
            asset_match_score = cls._asset_match_score(definition, asset)
            if definition.applies_to_all or asset_match_score > 0 or relevant_occurrences:
                matched_assets.append(
                    {
                        "asset": asset,
                        "match_score": max(asset_match_score, 0.35 if definition.applies_to_all else 0.0),
                        "occurrences": relevant_occurrences,
                    }
                )
                matched_occurrences.extend(relevant_occurrences)

        candidate_assets = matched_assets or [
            {"asset": asset, "match_score": 0.1, "occurrences": []} for asset in context["assets"]
        ]
        governance = cls._governance_signal(definition)
        probability = cls._probability(definition, matched_occurrences, candidate_assets, governance)
        impact = cls._impact(definition, candidate_assets)
        exposure = cls._exposure(definition, candidate_assets)
        mitigation_coverage = governance["mitigation_coverage"]
        mitigation_gap = round(1 - mitigation_coverage, 3)
        raw_product = probability * impact * exposure * mitigation_gap
        score = round((raw_product ** 0.5) * 100, 1)
        confidence = cls._confidence(definition, matched_occurrences, candidate_assets, governance)
        feature_vector, predictive_factors = cls._predictive_features(
            definition,
            matched_occurrences,
            candidate_assets,
            governance,
            exposure,
            mitigation_gap,
        )
        predictive_model = cls._predictive_model_payload(score, feature_vector, predictive_factors, context)

        top_assets = cls._top_assets(definition, candidate_assets)[:10]
        top_vulnerabilities = cls._top_vulnerabilities(matched_occurrences)[:10]
        level = cls._level(score)
        result = {
            "id": definition.id,
            "label": definition.label,
            "description": definition.description,
            "category": definition.category,
            "horizon_days": horizon_days,
            "score": score,
            "level": level,
            "trend": "stable",
            "confidence": confidence,
            "dimensions": {
                "probability": round(probability * 100, 1),
                "impact": round(impact * 100, 1),
                "exposure": round(exposure * 100, 1),
                "mitigation_coverage": round(mitigation_coverage * 100, 1),
                "mitigation_gap": round(mitigation_gap * 100, 1),
            },
            "counts": {
                "affected_assets": len({str(item["asset"].id) for item in candidate_assets}),
                "relevant_vulnerabilities": len({str(occurrence.vulnerability_id) for occurrence in matched_occurrences}),
                "relevant_occurrences": len(matched_occurrences),
                "kev_occurrences": sum(1 for occurrence in matched_occurrences if occurrence.vulnerability.is_in_kev),
                "controls_considered": governance["controls_count"],
                "mechanisms_considered": governance["mechanisms_count"],
                "evidence_items": governance["evidence_count"],
            },
            "top_assets": top_assets,
            "top_vulnerabilities": top_vulnerabilities,
            "rationale": cls._rationale(definition, probability, impact, exposure, mitigation_gap, top_assets, top_vulnerabilities),
            "next_action": cls._next_action(definition, score, mitigation_gap, top_vulnerabilities, top_assets),
            "predictive_model": predictive_model,
            "governance": {
                "control_keywords": list(definition.control_keywords),
                "controls_count": governance["controls_count"],
                "mechanisms_count": governance["mechanisms_count"],
                "evidence_count": governance["evidence_count"],
                "mitigation_coverage": round(mitigation_coverage * 100, 1),
                "top_controls": governance["top_controls"][:5],
                "top_mechanisms": governance["top_mechanisms"][:5],
            },
        }
        if include_detail:
            result["assets"] = top_assets[:20]
            result["vulnerabilities"] = top_vulnerabilities[:20]
            result["matched_services"] = cls._matched_services(definition, candidate_assets)
            result["formula_factors"] = [
                {"code": "probability", "label": "Probabilidade prospetiva", "value": result["dimensions"]["probability"]},
                {"code": "impact", "label": "Impacto organizacional", "value": result["dimensions"]["impact"]},
                {"code": "exposure", "label": "Exposicao tecnica", "value": result["dimensions"]["exposure"]},
                {"code": "mitigation_gap", "label": "Fragilidade de mitigacao", "value": result["dimensions"]["mitigation_gap"]},
                {"code": "confidence", "label": "Confianca dos dados", "value": confidence["score"]},
            ]
        return result

    @classmethod
    def _predictive_features(
        cls,
        definition: AttackVectorDefinition,
        occurrences: list[AssetVulnerability],
        candidate_assets: list[dict[str, Any]],
        governance: dict[str, Any],
        exposure: float,
        mitigation_gap: float,
    ) -> tuple[dict[str, float], list[dict[str, Any]]]:
        assets = [item["asset"] for item in candidate_assets]
        cvss_values = sorted(
            [cls._clamp(cls._float(item.vulnerability.cvss_score) / 10.0, 0.0, 1.0) for item in occurrences],
            reverse=True,
        )[:10]
        epss_values = sorted(
            [cls._clamp(cls._float(item.vulnerability.epss_score), 0.0, 1.0) for item in occurrences],
            reverse=True,
        )[:10]
        criticality_values = sorted(
            [CRITICALITY_SCOREMAP.get(str(asset.criticality).lower(), 0.5) for asset in assets],
            reverse=True,
        )[:10]
        business_values = sorted([cls._normal_1_5(getattr(asset, "business_value", 3)) for asset in assets], reverse=True)[:10]
        dependency_values = sorted([cls._normal_1_5(getattr(asset, "dependency_score", 3)) for asset in assets], reverse=True)[:10]
        evidence_basis = governance.get("links_count") or governance.get("mechanisms_count") or governance.get("controls_count") or 1
        evidence_gap = 1.0 - cls._clamp(governance.get("evidence_count", 0) / max(evidence_basis, 1), 0.0, 1.0)

        feature_values = {
            "cvss": cls._avg(cvss_values, definition.min_cvss / 10.0 if definition.min_cvss else 0.0),
            "epss": cls._avg(epss_values, definition.min_epss or 0.0),
            "kev": cls._clamp(sum(1 for item in occurrences if item.vulnerability.is_in_kev) / 3.0, 0.0, 1.0),
            "asset_criticality": cls._avg(criticality_values, 0.5),
            "exposure": exposure,
            "business_value": cls._avg(business_values, 0.5),
            "dependency": cls._avg(dependency_values, 0.5),
            "mechanism_gap": mitigation_gap,
            "evidence_gap": evidence_gap,
            "regulatory_relevance": cls._clamp(governance.get("controls_count", 0) / 5.0, 0.0, 1.0),
            "residual_risk_gap": mitigation_gap,
        }
        feature_vector = {
            code: round(cls._clamp(feature_values.get(code, 0.0), 0.0, 1.0), 4)
            for code in PRIORITY_FEATURE_CODES
        }
        factors = [cls._predictive_factor(code, feature_vector[code]) for code in PRIORITY_FEATURE_CODES]
        return feature_vector, factors

    @staticmethod
    def _predictive_factor(code: str, value: float) -> dict[str, Any]:
        metadata = {
            "cvss": (
                "CVSS agregado",
                f"{round(value * 10, 1)}/10",
                "Severidade tecnica media das vulnerabilidades mais relevantes para o vetor.",
            ),
            "epss": (
                "EPSS agregado",
                f"{round(value * 100, 1)}%",
                "Probabilidade observada de exploracao herdada do sinal EPSS.",
            ),
            "kev": (
                "CISA KEV",
                f"{round(value * 100, 1)}%",
                "Presenca de vulnerabilidades com exploracao conhecida no catalogo CISA KEV.",
            ),
            "asset_criticality": (
                "Criticidade dos ativos",
                f"{round(value * 100, 1)}%",
                "Criticidade organizacional dos ativos afetados pelo cenario.",
            ),
            "exposure": (
                "Exposicao tecnica",
                f"{round(value * 100, 1)}%",
                "Superficie exposta medida por classificacao do ativo e snapshots tecnicos.",
            ),
            "business_value": (
                "Valor de negocio",
                f"{round(value * 100, 1)}%",
                "Valor operacional dos ativos que sustentam o cenario.",
            ),
            "dependency": (
                "Dependencia",
                f"{round(value * 100, 1)}%",
                "Dependencia sistemica dos ativos para processos e servicos.",
            ),
            "mechanism_gap": (
                "Lacuna de mecanismos",
                f"{round(value * 100, 1)}%",
                "Fragilidade dos mecanismos de mitigacao associados aos controlos relevantes.",
            ),
            "evidence_gap": (
                "Lacuna de evidencia",
                f"{round(value * 100, 1)}%",
                "Ausencia relativa de evidencia valida para sustentar as mitigacoes.",
            ),
            "regulatory_relevance": (
                "Relevancia regulatoria",
                f"{round(value * 100, 1)}%",
                "Densidade de controlos internos/frameworks associados a este vetor.",
            ),
            "residual_risk_gap": (
                "Lacuna residual",
                f"{round(value * 100, 1)}%",
                "Fragilidade residual depois de consideradas as mitigacoes conhecidas.",
            ),
        }
        label, raw_value, explanation = metadata.get(code, (code, str(value), "Feature projetada para o modelo interno."))
        weight = float(DEFAULT_RISK_WEIGHTS.get(code, 0.0))
        return {
            "code": code,
            "label": label,
            "raw_value": raw_value,
            "normalized_score": round(value * 100, 1),
            "weight": round(weight, 4),
            "contribution": round(value * weight * 100, 2),
            "source": "Projecao de cenario para vetor de priorizacao",
            "explanation": explanation,
        }

    @classmethod
    def _predictive_model_payload(
        cls,
        official_score: float,
        feature_vector: dict[str, float],
        factors: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        config = context.get("priority_model_config") or PriorityModelConfig.get_config()
        readiness = context.get("priority_model_readiness") or config.readiness_snapshot()
        payload = {
            "official_score_source": "attack_vector_risk_v1",
            "served_mode": PriorityModelConfig.Mode.EXPLAINABLE_WEIGHTED,
            "enabled": False,
            "shadow_mode_enabled": bool(config.shadow_mode_enabled),
            "reason": "Shadow mode XGBoost+SHAP desativado na administracao do modelo de priorizacao.",
            "warning": ATTACK_VECTOR_ML_WARNING,
            "readiness": readiness,
            "feature_vector": feature_vector,
            "contribution_breakdown": factors,
        }
        if not config.shadow_mode_enabled:
            return payload
        if not readiness.get("ready"):
            payload["reason"] = "Modelo interno ainda nao pronto para execucao em shadow mode."
            return payload
        try:
            from risk.services.priority_model import (
                PriorityModelDataError,
                PriorityModelDependencyError,
                PriorityModelRuntime,
            )

            prediction = PriorityModelRuntime.predict(feature_vector, factors)
        except (PriorityModelDataError, PriorityModelDependencyError) as exc:
            payload["reason"] = str(exc)
            return payload

        predicted_score = prediction.get("priority_score")
        payload.update(
            {
                "enabled": True,
                "served_mode": "shadow",
                "reason": "XGBoost+SHAP executado em paralelo; score oficial inalterado.",
                "model_version": prediction.get("model_version"),
                "predicted_score": predicted_score,
                "delta": round(float(predicted_score or 0.0) - official_score, 2),
                "contribution_breakdown": prediction.get("contribution_breakdown", factors),
            }
        )
        return payload

    @classmethod
    def _occurrence_matches(cls, definition: AttackVectorDefinition, occurrence: AssetVulnerability) -> bool:
        vulnerability = occurrence.vulnerability
        cvss = cls._float(vulnerability.cvss_score)
        epss = cls._float(vulnerability.epss_score)
        if definition.min_cvss is not None and cvss >= definition.min_cvss:
            return True
        if definition.min_epss is not None and epss >= definition.min_epss:
            return True
        if definition.kev_relevant and vulnerability.is_in_kev:
            return True
        text = cls._occurrence_text(occurrence)
        return cls._contains_any(text, definition.vulnerability_keywords + definition.service_keywords)

    @classmethod
    def _asset_match_score(cls, definition: AttackVectorDefinition, asset: Asset) -> float:
        latest = cls._latest_snapshot(asset)
        score = 0.0
        if cls._contains_any(cls._asset_text(asset), definition.asset_keywords):
            score = max(score, 0.7)
        if latest:
            ports = cls._ports_from_snapshot(latest)
            services_text = " ".join(cls._services_from_snapshot(latest)).lower()
            if definition.ports and any(port in definition.ports for port in ports):
                score = max(score, 1.0)
            if definition.service_keywords and cls._contains_any(services_text, definition.service_keywords):
                score = max(score, 0.9)
        if getattr(asset, "exposure", 0) >= 4 and definition.service_keywords:
            score = max(score, 0.55)
        return score

    @classmethod
    def _probability(
        cls,
        definition: AttackVectorDefinition,
        occurrences: list[AssetVulnerability],
        candidate_assets: list[dict[str, Any]],
        governance: dict[str, Any],
    ) -> float:
        epss_values = sorted([cls._float(item.vulnerability.epss_score) for item in occurrences], reverse=True)
        cvss_values = sorted([cls._float(item.vulnerability.cvss_score) / 10.0 for item in occurrences], reverse=True)
        avg_top_epss = sum(epss_values[:10]) / max(len(epss_values[:10]), 1) if epss_values else 0.0
        avg_top_cvss = sum(cvss_values[:10]) / max(len(cvss_values[:10]), 1) if cvss_values else 0.0
        kev_signal = min(sum(1 for item in occurrences if item.vulnerability.is_in_kev) / 3.0, 1.0)
        threat_signal = max(avg_top_epss, (avg_top_cvss * 0.65), kev_signal)
        service_signal = cls._service_signal(definition, candidate_assets)
        governance_signal = 1 - governance["mitigation_coverage"]
        probability = (
            (0.45 * threat_signal)
            + (0.25 * service_signal)
            + (0.15 * governance_signal)
            + (0.15 * definition.baseline_likelihood)
        )
        return cls._clamp(probability, 0.05, 1.0)

    @classmethod
    def _impact(cls, definition: AttackVectorDefinition, candidate_assets: list[dict[str, Any]]) -> float:
        impacts = [cls._asset_impact(definition, item["asset"]) for item in candidate_assets]
        impacts.sort(reverse=True)
        top = impacts[:10]
        return cls._clamp(sum(top) / max(len(top), 1), 0.05, 1.0)

    @classmethod
    def _exposure(cls, definition: AttackVectorDefinition, candidate_assets: list[dict[str, Any]]) -> float:
        values = []
        for item in candidate_assets:
            asset = item["asset"]
            snapshot = cls._latest_snapshot(asset)
            exposure = cls._normal_1_5(getattr(asset, "exposure", 3))
            if snapshot:
                exposure = max(exposure, cls._normal_1_5(snapshot.exposure_score))
            values.append(max(exposure, item["match_score"]))
        values.sort(reverse=True)
        service_signal = cls._service_signal(definition, candidate_assets)
        top_average = sum(values[:10]) / max(len(values[:10]), 1) if values else 0.1
        return cls._clamp(max(top_average, service_signal), 0.05, 1.0)

    @classmethod
    def _governance_signal(cls, definition: AttackVectorDefinition) -> dict[str, Any]:
        try:
            from governance.models import EvidenceItem, EvidenceLink, InternalControl, InternalControlMechanism, Mechanism
        except Exception:
            return cls._empty_governance_signal()

        q = cls._keyword_q(definition.control_keywords, ("title", "description", "control_domain", "objective", "risk_statement"))
        controls = InternalControl.objects.filter(q, is_active=True).exclude(status=InternalControl.Status.ARCHIVED)
        mechanism_q = cls._keyword_q(definition.control_keywords, ("title", "description"))
        mechanisms = Mechanism.objects.filter(mechanism_q)
        links = InternalControlMechanism.objects.select_related("internal_control", "mechanism").filter(
            Q(internal_control__in=controls) | Q(mechanism__in=mechanisms)
        ).exclude(
            validation_status__in=[
                InternalControlMechanism.ValidationStatus.REJECTED,
                InternalControlMechanism.ValidationStatus.DEPRECATED,
            ]
        )
        links = list(links[:200])
        mechanism_ids = {link.mechanism_id for link in links}
        mechanism_ids.update(item.id for item in mechanisms[:100])
        evidence_count = 0
        if mechanism_ids:
            evidence_count = EvidenceLink.objects.filter(
                target_type=EvidenceLink.TargetType.MECHANISM,
                target_id__in=mechanism_ids,
                validation_status=EvidenceLink.ValidationStatus.APPROVED,
                evidence_item__status=EvidenceItem.Status.VALID,
            ).count()

        if links:
            implementation = sum(
                IMPLEMENTATION_COVERAGE.get(link.implementation_status, 0.0) for link in links
            ) / len(links)
        elif mechanisms.exists() or controls.exists():
            implementation = 0.15
        else:
            implementation = 0.0
        evidence_coverage = min(evidence_count / max(len(links), 1), 1.0) if links else 0.0
        mitigation_coverage = cls._clamp((implementation * 0.75) + (evidence_coverage * 0.25), 0.0, 1.0)
        return {
            "controls_count": controls.count(),
            "mechanisms_count": mechanisms.count(),
            "links_count": len(links),
            "evidence_count": evidence_count,
            "mitigation_coverage": mitigation_coverage,
            "top_controls": [
                {"id": str(control.id), "code": control.code, "title": control.title}
                for control in controls[:10]
            ],
            "top_mechanisms": [
                {
                    "id": str(link.mechanism_id),
                    "title": link.mechanism.title,
                    "implementation_status": link.implementation_status,
                    "validation_status": link.validation_status,
                }
                for link in links[:10]
            ],
        }

    @staticmethod
    def _empty_governance_signal() -> dict[str, Any]:
        return {
            "controls_count": 0,
            "mechanisms_count": 0,
            "links_count": 0,
            "evidence_count": 0,
            "mitigation_coverage": 0.0,
            "top_controls": [],
            "top_mechanisms": [],
        }

    @classmethod
    def _confidence(
        cls,
        definition: AttackVectorDefinition,
        occurrences: list[AssetVulnerability],
        candidate_assets: list[dict[str, Any]],
        governance: dict[str, Any],
    ) -> dict[str, Any]:
        assets = [item["asset"] for item in candidate_assets]
        if assets:
            owner_ratio = sum(1 for asset in assets if asset.business_owner_id or asset.owner) / len(assets)
            exposure_ratio = sum(1 for asset in assets if cls._latest_snapshot(asset) or getattr(asset, "exposure", None)) / len(assets)
            classification_ratio = sum(1 for asset in assets if getattr(asset, "criticality", None)) / len(assets)
            asset_confidence = (owner_ratio * 0.35) + (exposure_ratio * 0.35) + (classification_ratio * 0.30)
        else:
            asset_confidence = 0.0

        if occurrences:
            cvss_ratio = sum(1 for item in occurrences if item.vulnerability.cvss_score is not None) / len(occurrences)
            epss_ratio = sum(1 for item in occurrences if item.vulnerability.epss_score is not None) / len(occurrences)
            vuln_confidence = (cvss_ratio * 0.55) + (epss_ratio * 0.45)
        else:
            vuln_confidence = 0.45 if definition.applies_to_all else 0.20

        governance_confidence = cls._clamp(
            (min(governance["controls_count"], 5) / 5 * 0.35)
            + (min(governance["links_count"], 5) / 5 * 0.40)
            + (min(governance["evidence_count"], 3) / 3 * 0.25),
            0.0,
            1.0,
        )
        score = round(((asset_confidence + vuln_confidence + governance_confidence) / 3) * 100, 1)
        return {
            "score": score,
            "level": "high" if score >= 75 else "medium" if score >= 45 else "low",
            "components": {
                "assets": round(asset_confidence * 100, 1),
                "vulnerabilities": round(vuln_confidence * 100, 1),
                "governance": round(governance_confidence * 100, 1),
            },
        }

    @classmethod
    def _top_assets(cls, definition: AttackVectorDefinition, candidate_assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rows = []
        for item in candidate_assets:
            asset = item["asset"]
            score = round(
                (
                    cls._asset_impact(definition, asset) * 0.45
                    + cls._normal_1_5(getattr(asset, "exposure", 3)) * 0.25
                    + item["match_score"] * 0.20
                    + min(len(item["occurrences"]) / 5, 1.0) * 0.10
                )
                * 100,
                1,
            )
            rows.append(
                {
                    "id": str(asset.id),
                    "name": asset.name,
                    "criticality": asset.criticality,
                    "exposure": getattr(asset, "exposure", None),
                    "business_value": getattr(asset, "business_value", None),
                    "open_relevant_occurrences": len(item["occurrences"]),
                    "score": score,
                    "latest_exposure": cls._latest_exposure_payload(asset),
                }
            )
        rows.sort(key=lambda item: item["score"], reverse=True)
        return rows

    @classmethod
    def _top_vulnerabilities(cls, occurrences: list[AssetVulnerability]) -> list[dict[str, Any]]:
        rows = {}
        for occurrence in occurrences:
            vulnerability = occurrence.vulnerability
            key = str(vulnerability.id)
            current = rows.setdefault(
                key,
                {
                    "id": key,
                    "cve_id": vulnerability.cve_id,
                    "severity": vulnerability.severity,
                    "cvss_score": cls._float(vulnerability.cvss_score),
                    "epss_score": cls._float(vulnerability.epss_score),
                    "is_in_kev": vulnerability.is_in_kev,
                    "affected_assets": set(),
                    "occurrences": 0,
                },
            )
            current["affected_assets"].add(str(occurrence.asset_id))
            current["occurrences"] += 1
        result = []
        for item in rows.values():
            item["affected_assets"] = len(item["affected_assets"])
            item["score"] = round(
                (item["cvss_score"] / 10 * 0.45 + item["epss_score"] * 0.35 + (1.0 if item["is_in_kev"] else 0.0) * 0.20)
                * 100,
                1,
            )
            result.append(item)
        result.sort(key=lambda item: item["score"], reverse=True)
        return result

    @classmethod
    def _matched_services(cls, definition: AttackVectorDefinition, candidate_assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
        services = []
        seen = set()
        for item in candidate_assets:
            asset = item["asset"]
            snapshot = cls._latest_snapshot(asset)
            if not snapshot:
                continue
            ports = cls._ports_from_snapshot(snapshot)
            service_texts = cls._services_from_snapshot(snapshot)
            if not any(port in definition.ports for port in ports) and not cls._contains_any(" ".join(service_texts), definition.service_keywords):
                continue
            key = (str(asset.id), tuple(sorted(ports)), tuple(sorted(service_texts)))
            if key in seen:
                continue
            seen.add(key)
            services.append(
                {
                    "asset_id": str(asset.id),
                    "asset_name": asset.name,
                    "ports": ports,
                    "services": service_texts,
                    "captured_at": snapshot.captured_at.isoformat() if snapshot.captured_at else None,
                }
            )
        return services[:20]

    @classmethod
    def _rationale(
        cls,
        definition: AttackVectorDefinition,
        probability: float,
        impact: float,
        exposure: float,
        mitigation_gap: float,
        top_assets: list[dict[str, Any]],
        top_vulnerabilities: list[dict[str, Any]],
    ) -> list[str]:
        reasons = [
            f"Probabilidade prospetiva {round(probability * 100, 1)}% para o horizonte avaliado.",
            f"Impacto organizacional {round(impact * 100, 1)}% calculado a partir de criticidade, valor e dependencia dos ativos.",
            f"Exposicao tecnica {round(exposure * 100, 1)}% considerando classificacao do ativo e ultimo snapshot de superficie.",
            f"Fragilidade de mitigacao {round(mitigation_gap * 100, 1)}% calculada por controlos, mecanismos e evidencias.",
        ]
        if top_assets:
            reasons.append(f"Ativo mais relevante: {top_assets[0]['name']} ({top_assets[0]['criticality']}).")
        if top_vulnerabilities:
            vuln = top_vulnerabilities[0]
            reasons.append(f"Vulnerabilidade mais relevante: {vuln['cve_id']} com CVSS {vuln['cvss_score']} e EPSS {vuln['epss_score']}.")
        if definition.kev_relevant and any(item.get("is_in_kev") for item in top_vulnerabilities):
            reasons.append("Existem vulnerabilidades assinaladas em CISA KEV, indicando exploracao observada.")
        return reasons

    @staticmethod
    def _next_action(
        definition: AttackVectorDefinition,
        score: float,
        mitigation_gap: float,
        top_vulnerabilities: list[dict[str, Any]],
        top_assets: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if top_vulnerabilities:
            return {
                "label": "Priorizar vulnerabilidades deste vetor",
                "href": f"/risks/prioritization?vector={definition.id}",
                "reason": "Existem ocorrencias tecnicas relevantes que podem ser ordenadas por contexto organizacional.",
            }
        if mitigation_gap >= 0.65:
            return {
                "label": "Validar controlos e evidencias mitigadoras",
                "href": "/governance/mechanisms",
                "reason": "O score e sobretudo explicado por ausencia ou fragilidade de mecanismos/evidencias.",
            }
        if top_assets:
            return {
                "label": "Rever ativos mais expostos",
                "href": f"/assets/{top_assets[0]['id']}",
                "reason": "O vetor e impulsionado por ativos criticos ou expostos.",
            }
        return {
            "label": "Completar dados para aumentar confianca",
            "href": "/mission-control",
            "reason": "Faltam sinais suficientes para uma recomendacao mais especifica.",
        }

    @staticmethod
    def _level(score: float) -> str:
        if score >= 75:
            return "critical"
        if score >= 55:
            return "high"
        if score >= 35:
            return "medium"
        return "low"

    @staticmethod
    def _latest_snapshot(asset: Asset) -> AssetExposureSnapshot | None:
        snapshots = getattr(asset, "_attack_vector_exposure_snapshots", None)
        if snapshots is not None:
            return snapshots[0] if snapshots else None
        return asset.exposure_snapshots.order_by("-captured_at").first()

    @classmethod
    def _latest_exposure_payload(cls, asset: Asset) -> dict[str, Any] | None:
        snapshot = cls._latest_snapshot(asset)
        if not snapshot:
            return None
        return {
            "captured_at": snapshot.captured_at.isoformat() if snapshot.captured_at else None,
            "source": snapshot.source,
            "score": snapshot.exposure_score,
            "label": snapshot.exposure_label,
            "open_ports": cls._ports_from_snapshot(snapshot),
            "services": cls._services_from_snapshot(snapshot),
        }

    @classmethod
    def _asset_impact(cls, definition: AttackVectorDefinition, asset: Asset) -> float:
        values = []
        if "criticality" in definition.impact_focus:
            values.append(CRITICALITY_SCOREMAP.get(str(asset.criticality).lower(), 0.5))
        if "business_value" in definition.impact_focus:
            values.append(cls._normal_1_5(getattr(asset, "business_value", 3)))
        if "dependency" in definition.impact_focus:
            values.append(cls._normal_1_5(getattr(asset, "dependency_score", 3)))
        if "confidentiality" in definition.impact_focus:
            values.append(cls._normal_1_5(getattr(asset, "confidentiality", 3)))
        if "integrity" in definition.impact_focus:
            values.append(cls._normal_1_5(getattr(asset, "integrity", 3)))
        if "availability" in definition.impact_focus:
            values.append(cls._normal_1_5(getattr(asset, "availability", 3)))
        return cls._clamp(sum(values) / max(len(values), 1), 0.05, 1.0)

    @classmethod
    def _service_signal(cls, definition: AttackVectorDefinition, candidate_assets: list[dict[str, Any]]) -> float:
        if not candidate_assets:
            return 0.0
        matches = 0.0
        for item in candidate_assets:
            asset = item["asset"]
            snapshot = cls._latest_snapshot(asset)
            if not snapshot:
                matches += item["match_score"] * 0.4
                continue
            ports = cls._ports_from_snapshot(snapshot)
            services = " ".join(cls._services_from_snapshot(snapshot))
            if definition.ports and any(port in definition.ports for port in ports):
                matches += 1.0
            elif definition.service_keywords and cls._contains_any(services, definition.service_keywords):
                matches += 0.8
            else:
                matches += item["match_score"] * 0.4
        return cls._clamp(matches / len(candidate_assets), 0.0, 1.0)

    @staticmethod
    def _avg(values: list[float], default: float = 0.0) -> float:
        if not values:
            return default
        return sum(values) / max(len(values), 1)

    @staticmethod
    def _normal_1_5(value: Any) -> float:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            numeric = 3.0
        return max(0.0, min(numeric, 5.0)) / 5.0

    @staticmethod
    def _float(value: Any) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _clamp(value: float, min_val: float, max_val: float) -> float:
        return max(min_val, min(value, max_val))

    @staticmethod
    def _contains_any(text: str, keywords: tuple[str, ...] | list[str]) -> bool:
        text = (text or "").lower()
        return any(keyword.lower() in text for keyword in keywords if keyword)

    @staticmethod
    def _asset_text(asset: Asset) -> str:
        fields = [
            asset.name,
            asset.description,
            asset.supported_service,
            asset.business_process,
            getattr(asset.category, "name", ""),
            getattr(asset.asset_type, "name", ""),
            getattr(asset.environment, "name", ""),
            getattr(asset.deployment_type, "name", ""),
        ]
        return " ".join(str(value or "") for value in fields).lower()

    @staticmethod
    def _occurrence_text(occurrence: AssetVulnerability) -> str:
        vulnerability = occurrence.vulnerability
        software = occurrence.software
        fields = [
            vulnerability.cve_id,
            vulnerability.description,
            vulnerability.mitigation,
            software.name if software else "",
            occurrence.software_version,
        ]
        return " ".join(str(value or "") for value in fields).lower()

    @staticmethod
    def _ports_from_snapshot(snapshot: AssetExposureSnapshot) -> list[int]:
        ports = []
        for item in snapshot.open_ports or []:
            if isinstance(item, dict):
                candidate = item.get("port") or item.get("portid") or item.get("number")
            else:
                candidate = item
            try:
                ports.append(int(candidate))
            except (TypeError, ValueError):
                continue
        return sorted(set(ports))

    @staticmethod
    def _services_from_snapshot(snapshot: AssetExposureSnapshot) -> list[str]:
        values = []
        for item in snapshot.services or []:
            if isinstance(item, dict):
                values.extend(str(item.get(key, "")) for key in ("name", "service", "product", "version"))
            else:
                values.append(str(item))
        return sorted({value.strip() for value in values if value and value.strip()})

    @staticmethod
    def _keyword_q(keywords: tuple[str, ...], fields: tuple[str, ...]) -> Q:
        if not keywords:
            return Q(pk__isnull=True)
        query = Q()
        for keyword in keywords:
            for field_name in fields:
                query |= Q(**{f"{field_name}__icontains": keyword})
        return query
