import unicodedata

from django.db import models

from governance.models import (
    ComplianceGap,
    Control,
    Framework,
    GovernanceDocument,
    InternalControl,
    Policy,
)
from governance.services.control_mapping_engine import ControlMappingEngine
from governance.services.compliance_propagation_engine import CompliancePropagationEngine
from governance.services.security_posture_drift import SecurityPostureDriftService
from risk.models import Asset, Vulnerability


class StructuredQueryService:
    """
    Executes deterministic ORM queries for questions that should not go to the LLM.
    """

    @staticmethod
    def normalize_text(text: str) -> str:
        text = (text or "").lower().strip()
        return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")

    @classmethod
    def detect_structured_intent(cls, query: str):
        q = cls.normalize_text(query)

        if any(term in q for term in ["primeiro", "piores", "top", "maior risco", "priorizar", "mitigar"]):
            return "top_priorities"

        if any(term in q for term in ["quantos", "quantas", "numero de", "total de"]):
            return "count"

        if any(term in q for term in ["quais", "listar", "mostra", "mostrar", "lista"]):
            if any(term in q for term in ["ip", "ips", "endereco", "enderecos"]):
                return "list_with_fields"
            return "list"

        if any(term in q for term in ["alguma", "algum", "existe", "existem", "tenho"]):
            return "exists"

        return "count"

    @classmethod
    def detect_policy_status(cls, query: str):
        q = cls.normalize_text(query)
        if any(term in q for term in ["ativa", "ativas", "ativo", "ativos", "active", "em vigor", "vigente"]):
            return Policy.Status.ACTIVE
        if any(term in q for term in ["rascunho", "draft"]):
            return Policy.Status.DRAFT
        if any(term in q for term in ["revisao", "review"]):
            return Policy.Status.REVIEW
        if any(term in q for term in ["obsoleta", "obsoletas", "obsolete"]):
            return Policy.Status.OBSOLETE
        return None

    @staticmethod
    def policy_status_label(status: str):
        labels = {
            Policy.Status.ACTIVE: "ativa",
            Policy.Status.DRAFT: "em rascunho",
            Policy.Status.REVIEW: "em revisao",
            Policy.Status.OBSOLETE: "obsoleta",
        }
        return labels.get(status, status or "sem estado")

    @classmethod
    def is_compliance_query(cls, query: str) -> bool:
        q = cls.normalize_text(query)
        compliance_terms = [
            "score",
            "pontuacao",
            "percentagem",
            "gap",
            "gaps",
            "desvio",
            "desvios",
            "conformidade",
            "compliance",
            "pior",
            "piores",
            "fraco",
            "fracos",
            "baixo",
            "baixos",
        ]
        framework_terms = [
            "framework",
            "frameworks",
            "iso",
            "nist",
            "qnrc",
            "nis2",
            "27001",
            "27002",
            "csf",
            "controlo",
            "controlos",
        ]
        has_compliance_context = any(term in q for term in ["gap", "gaps", "desvio", "desvios", "conformidade", "compliance"])
        has_metric_context = any(term in q for term in compliance_terms)
        has_framework_context = any(term in q for term in framework_terms)
        return has_compliance_context or (has_metric_context and has_framework_context)

    @classmethod
    def is_drift_query(cls, query: str) -> bool:
        q = cls.normalize_text(query)
        drift_terms = [
            "piorou",
            "pioraram",
            "regressao",
            "regressao",
            "regrediu",
            "drift",
            "desde a ultima auditoria",
            "desde ultima auditoria",
            "alterou",
            "degradou",
            "degradacao",
            "postura",
        ]
        audit_terms = ["auditoria", "snapshot", "fotografia", "baseline", "postura", "conformidade"]
        return any(term in q for term in drift_terms) and any(term in q for term in audit_terms)

    @classmethod
    def detect_compliance_intent(cls, query: str) -> str:
        q = cls.normalize_text(query)
        if any(term in q for term in ["pior", "piores", "mais baixo", "menor score", "maior gap", "maiores gaps", "onde estou"]):
            return "worst_gaps"
        if any(term in q for term in ["quantos", "quantas", "numero de", "total de"]) and any(term in q for term in ["gap", "gaps", "desvio", "desvios"]):
            return "gap_count"
        if any(term in q for term in ["gap", "gaps", "desvio", "desvios"]):
            return "worst_gaps"
        return "score"

    @classmethod
    def match_framework_scores(cls, query: str, scores: list[dict]) -> list[dict]:
        q = cls.normalize_text(query)
        matches = []
        for score in scores:
            code = cls.normalize_text(score.get("framework_code", ""))
            name = cls.normalize_text(score.get("framework_name", ""))
            version = cls.normalize_text(score.get("version", ""))
            compact_code = code.replace(" ", "").replace("/", "").replace("-", "")
            compact_name = name.replace(" ", "").replace("/", "").replace("-", "")

            if code and code in q:
                matches.append(score)
                continue
            if compact_code and compact_code in q.replace(" ", "").replace("/", "").replace("-", ""):
                matches.append(score)
                continue
            if name and name in q:
                matches.append(score)
                continue
            if compact_name and compact_name in q.replace(" ", "").replace("/", "").replace("-", ""):
                matches.append(score)
                continue
            if version and version in q and any(token in q for token in ["iso", "nist", "qnrc", "nis2"]):
                matches.append(score)
                continue
            if "iso" in q and ("iso" in code or "iso" in name):
                if not any(number in q for number in ["27001", "27002"]) or any(number in code or number in name or number in version for number in ["27001", "27002"] if number in q):
                    matches.append(score)
                continue
            if "nist" in q and ("nist" in code or "nist" in name):
                matches.append(score)
                continue
            if "qnrc" in q and ("qnrc" in code or "qnrc" in name):
                matches.append(score)
                continue
            if "nis2" in q and ("nis2" in code or "nis2" in name or "nis2" in version):
                matches.append(score)

        return matches

    @staticmethod
    def status_label(status: str):
        labels = {
            "MISSING": "em falta",
            "PARTIAL": "parcial",
            "IMPLEMENTED": "implementado",
        }
        return labels.get(status, status or "sem estado")

    @classmethod
    def top_compliance_gaps(cls, framework_ids=None, limit: int = 5) -> list[dict]:
        gaps = ComplianceGap.objects.select_related("framework", "control").exclude(status="IMPLEMENTED")
        if framework_ids:
            gaps = gaps.filter(framework_id__in=framework_ids)

        gaps = gaps.annotate(
            status_rank=models.Case(
                models.When(status="MISSING", then=0),
                models.When(status="PARTIAL", then=1),
                default=2,
                output_field=models.IntegerField(),
            )
        ).order_by("status_rank", "evidence_count", "framework__code", "control__code")[:limit]

        return [
            {
                "framework_code": gap.framework.code,
                "framework_name": gap.framework.name,
                "version": gap.framework.version,
                "control_code": gap.control.code,
                "control_title": gap.control.title,
                "status": gap.status,
                "evidence_count": gap.evidence_count,
                "notes": gap.notes or "",
            }
            for gap in gaps
        ]

    @classmethod
    def compliance_gap_counts(cls, framework_ids=None) -> dict:
        gaps = ComplianceGap.objects.all()
        if framework_ids:
            gaps = gaps.filter(framework_id__in=framework_ids)
        return {
            "total": gaps.count(),
            "missing": gaps.filter(status="MISSING").count(),
            "partial": gaps.filter(status="PARTIAL").count(),
            "implemented": gaps.filter(status="IMPLEMENTED").count(),
        }

    @classmethod
    def has_internal_governance_layer(cls) -> bool:
        return InternalControl.objects.filter(is_active=True).exists()

    @classmethod
    def framework_scores_from_propagation(cls) -> list[dict]:
        frameworks = Framework.objects.filter(is_active=True).order_by("code", "version")
        scores = []
        for framework in frameworks:
            result = CompliancePropagationEngine.calculate_framework(
                framework,
                mode=CompliancePropagationEngine.OFFICIAL,
                include_details=True,
                include_gaps=True,
            )
            details = result.get("details") or {}
            controls = details.get("controls") or []
            scores.append(
                {
                    "framework_id": str(framework.id),
                    "framework_code": framework.code,
                    "framework_name": framework.name,
                    "version": framework.version,
                    "score": result.get("score", 0),
                    "status": result.get("status"),
                    "coverage": result.get("coverage", details.get("coverage", 0)),
                    "total_controls": details.get("total_controls", len(controls)),
                    "assessed_controls": details.get("assessed_controls", 0),
                    "compliant": sum(1 for item in controls if item.get("status") == "compliant"),
                    "mostly_compliant": sum(1 for item in controls if item.get("status") == "mostly_compliant"),
                    "partially_compliant": sum(1 for item in controls if item.get("status") == "partially_compliant"),
                    "non_compliant": sum(1 for item in controls if item.get("status") == "non_compliant"),
                    "not_assessed": sum(1 for item in controls if item.get("status") == "not_assessed"),
                    "gaps": result.get("gaps", []),
                }
            )
        return scores

    @classmethod
    def propagation_gap_counts(cls, target_scores: list[dict] | None = None) -> dict:
        gaps = []
        if target_scores:
            for score in target_scores:
                gaps.extend(score.get("gaps", []))
        else:
            gaps = CompliancePropagationEngine.collect_gaps(mode=CompliancePropagationEngine.OFFICIAL)

        return {
            "total": len(gaps),
            "high": sum(1 for gap in gaps if gap.get("severity") == "high"),
            "medium": sum(1 for gap in gaps if gap.get("severity") == "medium"),
            "low": sum(1 for gap in gaps if gap.get("severity") == "low"),
        }

    @classmethod
    def top_propagation_gaps(cls, target_scores: list[dict] | None = None, limit: int = 7) -> list[dict]:
        if target_scores:
            gaps = []
            for score in target_scores:
                for gap in score.get("gaps", []):
                    gap = dict(gap)
                    gap.setdefault("framework_code", score.get("framework_code"))
                    gap.setdefault("version", score.get("version"))
                    gaps.append(gap)
        else:
            gaps = CompliancePropagationEngine.collect_gaps(mode=CompliancePropagationEngine.OFFICIAL)

        severity_rank = {"high": 0, "medium": 1, "low": 2}
        return sorted(
            gaps,
            key=lambda gap: (
                severity_rank.get(gap.get("severity"), 9),
                -int(gap.get("estimated_impact") or 0),
                gap.get("type") or "",
            ),
        )[:limit]

    @classmethod
    def run_compliance_propagation_query(cls, query: str) -> dict:
        scores = cls.framework_scores_from_propagation()
        matches = cls.match_framework_scores(query, scores)
        target_scores = matches or scores
        intent = cls.detect_compliance_intent(query)

        if intent == "gap_count":
            result = {
                "type": "propagation_gap_count",
                "scores": target_scores,
                "counts": cls.propagation_gap_counts(target_scores if matches else None),
                "scoped": bool(matches),
                "raw_text": "",
            }
            result["raw_text"] = cls.format_structured_response(result)
            return result

        if intent == "worst_gaps":
            scoped_scores = sorted(
                target_scores,
                key=lambda item: (
                    item.get("score", 0),
                    item.get("coverage", 0),
                    -len(item.get("gaps", [])),
                ),
            )
            result = {
                "type": "propagation_worst_gaps",
                "scores": scoped_scores,
                "gaps": cls.top_propagation_gaps(scoped_scores[:1] if scoped_scores else None, limit=7),
                "raw_text": "",
            }
            result["raw_text"] = cls.format_structured_response(result)
            return result

        result = {
            "type": "propagation_framework_score_detail" if matches else "propagation_framework_score_summary",
            "scores": sorted(target_scores, key=lambda item: (item["framework_code"], item["version"])),
            "gaps": cls.top_propagation_gaps(target_scores, limit=5) if matches else [],
            "raw_text": "",
        }
        result["raw_text"] = cls.format_structured_response(result)
        return result

    @classmethod
    def run_compliance_query(cls, query: str) -> dict:
        if cls.has_internal_governance_layer():
            return cls.run_compliance_propagation_query(query)

        scores = ControlMappingEngine.framework_scores()
        matches = cls.match_framework_scores(query, scores)
        target_scores = matches or scores
        intent = cls.detect_compliance_intent(query)
        framework_ids = [item["framework_id"] for item in target_scores] if matches else None

        if intent == "gap_count":
            result = {
                "type": "compliance_gap_count",
                "scores": target_scores,
                "counts": cls.compliance_gap_counts(framework_ids),
                "scoped": bool(matches),
                "raw_text": "",
            }
            result["raw_text"] = cls.format_structured_response(result)
            return result

        if intent == "worst_gaps":
            scoped_scores = sorted(
                [item for item in target_scores if item["total_controls"] > 0] or target_scores,
                key=lambda item: (item["score"], -item["missing"], -item["partial"]),
            )
            if scoped_scores:
                framework_ids = [scoped_scores[0]["framework_id"]]
            result = {
                "type": "compliance_worst_gaps",
                "scores": scoped_scores,
                "gaps": cls.top_compliance_gaps(framework_ids, limit=7),
                "raw_text": "",
            }
            result["raw_text"] = cls.format_structured_response(result)
            return result

        result_type = "framework_score_detail" if matches else "framework_score_summary"
        result = {
            "type": result_type,
            "scores": sorted(target_scores, key=lambda item: (item["framework_code"], item["version"])),
            "gaps": cls.top_compliance_gaps(framework_ids, limit=5) if matches else [],
            "raw_text": "",
        }
        result["raw_text"] = cls.format_structured_response(result)
        return result

    @classmethod
    def run_drift_query(cls, query: str) -> dict:
        payload = SecurityPostureDriftService.overview()
        result = {
            "type": "posture_drift_summary",
            "payload": payload,
            "raw_text": "",
        }
        result["raw_text"] = cls.format_structured_response(result)
        return result

    @staticmethod
    def format_structured_response(result: dict):
        if result["type"] == "asset_count":
            return f"Atualmente, existem {result['value']} ativos registados na plataforma."

        if result["type"] == "asset_list":
            names = [a["name"] for a in result["data"]]
            if not names:
                return "Atualmente nao tem ativos registados."
            return "Os ativos existentes sao:\n- " + "\n- ".join(names)

        if result["type"] == "asset_list_with_ip":
            lines = [f"{a['name']} ({a['wazuh_ip'] or 'Sem IP'})" for a in result["data"]]
            if not lines:
                return "Atualmente nao tem ativos registados."
            return "Os ativos e respetivos IPs sao:\n- " + "\n- ".join(lines)

        if result["type"] == "vulnerability_count":
            return f"A plataforma tem um total de {result['value']} vulnerabilidades identificadas."

        if result["type"] == "vulnerability_top":
            lines = [
                f"{v['cve_id']} (Severidade: {v['severity']}, CVSS: {v['cvss_score']})"
                for v in result["data"]
            ]
            if not lines:
                return "Atualmente nao tem vulnerabilidades registadas que necessitem de mitigacao prioritaria."
            return "Com base em CVSS e EPSS, as principais vulnerabilidades prioritarias sao:\n- " + "\n- ".join(lines)

        if result["type"] == "control_count":
            return f"Existem de momento {result['value']} controlos de seguranca aplicados."

        if result["type"] == "control_list":
            lines = [f"{c['framework__code']}:{c['code']} - {c['title']}" for c in result["data"]]
            if not lines:
                return "Atualmente nao existem controlos registados."
            return "Os controlos registados sao:\n- " + "\n- ".join(lines[:25])

        if result["type"] == "internal_control_count":
            return (
                f"Existem de momento {result['value']} controlos internos ativos no catalogo da organizacao. "
                "Estes controlos sao agnosticos de frameworks e servem como centro da conformidade."
            )

        if result["type"] == "internal_control_list":
            lines = [
                (
                    f"{c['code']} - {c['title']} "
                    f"(dominio: {c['control_domain'] or 'nao definido'}, "
                    f"criticidade: {c['criticality']}, estado: {c['status']})"
                )
                for c in result["data"]
            ]
            if not lines:
                return "Atualmente nao existem controlos internos ativos registados."
            response = "Os controlos internos registados sao:\n- " + "\n- ".join(lines[:25])
            if result.get("external_controls_count"):
                response += (
                    f"\n\nNota: existem tambem {result['external_controls_count']} controlos externos/framework "
                    "mapeaveis, mas a resposta acima privilegia o catalogo interno."
                )
            return response

        if result["type"] == "policy_summary":
            total = result["value"]
            by_status = result["by_status"]
            response = (
                f"Existem {total} politicas registadas no SGSI. "
                f"Ativas: {by_status.get(Policy.Status.ACTIVE, 0)}; "
                f"Rascunho: {by_status.get(Policy.Status.DRAFT, 0)}; "
                f"Em revisao: {by_status.get(Policy.Status.REVIEW, 0)}; "
                f"Obsoletas: {by_status.get(Policy.Status.OBSOLETE, 0)}."
            )
            if "governance_documents" in result:
                docs = result["governance_documents"]
                response += (
                    f" Na camada documental transversal existem ainda {docs['total']} documentos de governacao "
                    f"({docs['policies']} do tipo policy, {docs['standards']} normas, "
                    f"{docs['procedures']} procedimentos e {docs['runbooks']} runbooks)."
                )
            return response

        if result["type"] == "policy_status_list":
            status_label = StructuredQueryService.policy_status_label(result["status"])
            policies = result["data"]
            if not policies:
                return f"Nao existem politicas {status_label} no SGSI."

            prefix = "Existe" if len(policies) == 1 else "Existem"
            noun = "politica" if len(policies) == 1 else "politicas"
            lines = [f"{p['code']} - {p['title']} (versao {p['version']})" for p in policies]
            return f"Sim. {prefix} {len(policies)} {noun} {status_label} no SGSI:\n- " + "\n- ".join(lines)

        if result["type"] == "propagation_framework_score_summary":
            scores = [item for item in result["scores"] if item.get("total_controls", 0) > 0]
            if not scores:
                return "Nao existem frameworks ativas com controlos externos para calcular conformidade por propagacao."
            lines = [
                (
                    f"{item['framework_code']} {item['version']}: {item['score']}% "
                    f"({item['status']}; cobertura {item['coverage']}%; "
                    f"{item['assessed_controls']}/{item['total_controls']} controlos externos avaliados)"
                )
                for item in scores
            ]
            return (
                "Score de conformidade por propagacao, usando controlos internos como fonte principal:\n- "
                + "\n- ".join(lines)
            )

        if result["type"] == "propagation_framework_score_detail":
            scores = result["scores"]
            if not scores:
                return "Nao encontrei uma framework correspondente na base de dados."
            lines = [
                (
                    f"{item['framework_code']} {item['version']}: {item['score']}% "
                    f"({item['status']}). Cobertura: {item['coverage']}%; "
                    f"controlos externos avaliados: {item['assessed_controls']}/{item['total_controls']}; "
                    f"compliant: {item['compliant']}; mostly compliant: {item['mostly_compliant']}; "
                    f"partial: {item['partially_compliant']}; non compliant: {item['non_compliant']}; "
                    f"not assessed: {item['not_assessed']}."
                )
                for item in scores
            ]
            gap_lines = [
                f"{gap.get('type')} ({gap.get('severity')}): {gap.get('description')}"
                for gap in result.get("gaps", [])
            ]
            response = "Estado de conformidade por propagacao da framework:\n- " + "\n- ".join(lines)
            if gap_lines:
                response += "\n\nPrincipais gaps a tratar:\n- " + "\n- ".join(gap_lines)
            return response

        if result["type"] == "propagation_worst_gaps":
            scores = result["scores"]
            if not scores:
                return "Nao existem scores de conformidade por propagacao calculaveis."
            worst = scores[0]
            response = (
                f"A framework com menor score por propagacao e {worst['framework_code']} {worst['version']} "
                f"({worst['score']}%, cobertura {worst['coverage']}%)."
            )
            gap_lines = [
                f"{gap.get('type')} ({gap.get('severity')}): {gap.get('description')}"
                for gap in result.get("gaps", [])
            ]
            if gap_lines:
                response += "\n\nGaps prioritarios:\n- " + "\n- ".join(gap_lines)
            return response

        if result["type"] == "propagation_gap_count":
            counts = result["counts"]
            scope = "nas frameworks selecionadas" if result.get("scoped") else "em todas as frameworks"
            return (
                f"Existem {counts['total']} gaps de conformidade por propagacao {scope}: "
                f"{counts['high']} altos, {counts['medium']} medios e {counts['low']} baixos."
            )

        if result["type"] == "framework_score_summary":
            scores = [item for item in result["scores"] if item.get("total_controls", 0) > 0]
            if not scores:
                return "Nao existem frameworks ativas com score de conformidade calculado."
            lines = [
                (
                    f"{item['framework_code']} {item['version']} - {item['score']}% "
                    f"({item['implemented']} implementados, {item['partial']} parciais, "
                    f"{item['missing']} em falta, {item['evidence_count']} evidencias)"
                )
                for item in scores
            ]
            return "Score de conformidade por framework:\n- " + "\n- ".join(lines)

        if result["type"] == "framework_score_detail":
            scores = result["scores"]
            if not scores:
                return "Nao encontrei uma framework correspondente na base de dados."
            if not any(item.get("total_controls", 0) > 0 for item in scores):
                framework_names = ", ".join(f"{item['framework_code']} {item['version']}" for item in scores)
                return (
                    f"A framework {framework_names} esta registada, mas ainda nao tem controlos importados. "
                    "Por isso, a plataforma nao deve interpretar o score como nao conformidade; o estado correto e sem dados suficientes."
                )
            lines = [
                (
                    f"{item['framework_code']} {item['version']}: {item['score']}% de conformidade. "
                    f"Controlos avaliados: {item['evaluated_controls']}/{item['total_controls']}; "
                    f"implementados: {item['implemented']}; parciais: {item['partial']}; "
                    f"em falta: {item['missing']}; cobertura de mapeamento: {item['mapping_coverage']}%."
                )
                for item in scores
            ]
            gap_lines = [
                f"{gap['framework_code']}:{gap['control_code']} - {gap['control_title']} ({StructuredQueryService.status_label(gap['status'])}, evidencias: {gap['evidence_count']})"
                for gap in result.get("gaps", [])
            ]
            response = "Estado de conformidade da framework:\n- " + "\n- ".join(lines)
            if gap_lines:
                response += "\n\nPrincipais gaps a tratar:\n- " + "\n- ".join(gap_lines)
            return response

        if result["type"] == "compliance_worst_gaps":
            scores = result["scores"]
            if not scores:
                return "Nao existem scores de conformidade calculados."
            worst = scores[0]
            response = (
                f"A framework com menor score e {worst['framework_code']} {worst['version']} "
                f"({worst['score']}%). Tem {worst['missing']} controlos em falta e "
                f"{worst['partial']} controlos parciais."
            )
            gap_lines = [
                f"{gap['framework_code']}:{gap['control_code']} - {gap['control_title']} ({StructuredQueryService.status_label(gap['status'])}, evidencias: {gap['evidence_count']})"
                for gap in result.get("gaps", [])
            ]
            if gap_lines:
                response += "\n\nGaps prioritarios:\n- " + "\n- ".join(gap_lines)
            return response

        if result["type"] == "compliance_gap_count":
            counts = result["counts"]
            scope = "nas frameworks selecionadas" if result.get("scoped") else "em todas as frameworks"
            return (
                f"Existem {counts['total']} gaps de conformidade {scope}: "
                f"{counts['missing']} em falta, {counts['partial']} parciais e "
                f"{counts['implemented']} implementados."
            )

        if result["type"] == "posture_drift_summary":
            payload = result["payload"]
            metrics = payload["metrics"]
            response = (
                "Análise de regressão de postura desde a última fotografia disponível:\n"
                f"- Eventos detetados: {metrics['total_events']} "
                f"({metrics['critical']} críticos, {metrics['high']} altos, {metrics['medium']} médios).\n"
                f"- Regressões de controlos: {metrics['control_regressions']}.\n"
                f"- Aumentos de exposição em ativos: {metrics['asset_exposure_regressions']}.\n"
                f"- Vulnerabilidades novas/recentes: {metrics['new_vulnerabilities']}.\n"
                f"- Gaps de mapping normativo: {metrics['framework_mapping_gaps']}.\n"
            )
            control_lines = [
                (
                    f"{item['framework']['code']}:{item['control_code']} - {item['control_title']} "
                    f"passou de {item['previous']['implementation_status']} para {item['current']['implementation_status']}."
                )
                for item in payload.get("control_regressions", [])[:5]
            ]
            if control_lines:
                response += "\nPrincipais regressões de controlo:\n- " + "\n- ".join(control_lines)
            recommendations = payload.get("recommendations", [])[:4]
            if recommendations:
                response += "\n\nRecomendações:\n- " + "\n- ".join(recommendations)
            return response

        return "Nao foi possivel interpretar a consulta estruturada."

    @classmethod
    def run_structured_query(cls, query: str) -> dict:
        q = cls.normalize_text(query)
        intent = cls.detect_structured_intent(query)

        if cls.is_drift_query(query):
            return cls.run_drift_query(query)

        if cls.is_compliance_query(query):
            return cls.run_compliance_query(query)

        if "ativo" in q or "ativos" in q:
            if intent == "count":
                value = Asset.objects.count()
                return {"type": "asset_count", "value": value, "raw_text": cls.format_structured_response({"type": "asset_count", "value": value})}

            if intent == "list":
                assets = list(Asset.objects.order_by("name").values("name"))
                return {"type": "asset_list", "data": assets, "raw_text": cls.format_structured_response({"type": "asset_list", "data": assets})}

            if intent == "list_with_fields":
                assets = list(Asset.objects.order_by("name").values("name", "wazuh_ip"))
                return {"type": "asset_list_with_ip", "data": assets, "raw_text": cls.format_structured_response({"type": "asset_list_with_ip", "data": assets})}

        if any(term in q for term in ["vulnerabilidades", "vulnerabilidade", "falhas", "falha"]):
            if intent == "count":
                value = Vulnerability.objects.count()
                return {"type": "vulnerability_count", "value": value, "raw_text": cls.format_structured_response({"type": "vulnerability_count", "value": value})}

            if intent == "top_priorities":
                vulns = list(
                    Vulnerability.objects.order_by(
                        models.F("cvss_score").desc(nulls_last=True),
                        models.F("epss_score").desc(nulls_last=True),
                    )[:5].values("cve_id", "severity", "cvss_score")
                )
                return {"type": "vulnerability_top", "data": vulns, "raw_text": cls.format_structured_response({"type": "vulnerability_top", "data": vulns})}

        if any(term in q for term in ["controlos", "controles", "controlo", "controle"]):
            if cls.has_internal_governance_layer():
                if intent == "count":
                    value = InternalControl.objects.filter(is_active=True).count()
                    result = {
                        "type": "internal_control_count",
                        "value": value,
                        "raw_text": "",
                    }
                    result["raw_text"] = cls.format_structured_response(result)
                    return result

                if intent == "list":
                    controls = list(
                        InternalControl.objects.filter(is_active=True)
                        .order_by("code")
                        .values("code", "title", "control_domain", "criticality", "status")[:100]
                    )
                    result = {
                        "type": "internal_control_list",
                        "data": controls,
                        "external_controls_count": Control.objects.count(),
                        "raw_text": "",
                    }
                    result["raw_text"] = cls.format_structured_response(result)
                    return result

            if intent == "count":
                value = Control.objects.count()
                return {"type": "control_count", "value": value, "raw_text": cls.format_structured_response({"type": "control_count", "value": value})}

            if intent == "list":
                controls = list(
                    Control.objects.select_related("framework")
                    .order_by("framework__code", "code")
                    .values("framework__code", "code", "title")
                )
                return {"type": "control_list", "data": controls, "raw_text": cls.format_structured_response({"type": "control_list", "data": controls})}

        if any(term in q for term in ["politica", "politicas", "sgsi"]):
            status_filter = cls.detect_policy_status(query)
            if status_filter:
                policies = list(
                    Policy.objects.filter(status=status_filter)
                    .order_by("code")
                    .values("code", "title", "version", "status", "next_review_date")
                )
                result = {
                    "type": "policy_status_list",
                    "status": status_filter,
                    "data": policies,
                    "raw_text": "",
                }
                result["raw_text"] = cls.format_structured_response(result)
                return result

            total = Policy.objects.count()
            by_status = {
                status: Policy.objects.filter(status=status).count()
                for status in [Policy.Status.ACTIVE, Policy.Status.DRAFT, Policy.Status.REVIEW, Policy.Status.OBSOLETE]
            }
            result = {
                "type": "policy_summary",
                "value": total,
                "by_status": by_status,
                "governance_documents": {
                    "total": GovernanceDocument.objects.filter(is_active=True).count(),
                    "policies": GovernanceDocument.objects.filter(
                        is_active=True,
                        document_type=GovernanceDocument.DocumentType.POLICY,
                    ).count(),
                    "standards": GovernanceDocument.objects.filter(
                        is_active=True,
                        document_type=GovernanceDocument.DocumentType.STANDARD,
                    ).count(),
                    "procedures": GovernanceDocument.objects.filter(
                        is_active=True,
                        document_type=GovernanceDocument.DocumentType.PROCEDURE,
                    ).count(),
                    "runbooks": GovernanceDocument.objects.filter(
                        is_active=True,
                        document_type=GovernanceDocument.DocumentType.RUNBOOK,
                    ).count(),
                },
                "raw_text": "",
            }
            result["raw_text"] = cls.format_structured_response(result)
            return result

        return {"type": "unknown", "value": None}
