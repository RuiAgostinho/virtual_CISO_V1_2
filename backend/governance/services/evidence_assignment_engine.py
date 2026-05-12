import re
from dataclasses import dataclass, asdict
from typing import Any

from django.db.models import Count, Max, Q

from governance.models import (
    ControlMechanism,
    MechanismEvidence,
    Policy,
    PolicyControl,
    PolicyEvidence,
    Procedure,
    TechnicalRegulation,
)
from risk.models import Asset, NetworkRange, Software
from risk.models.vulnerability import AssetVulnerability


AUTO_EVIDENCE_PREFIX = "Sugestao automatica validada pelo CISO."


@dataclass
class EvidenceSuggestion:
    id: str
    title: str
    description: str
    source_type: str
    source_label: str
    confidence: float
    rationale: str
    url: str = ""
    metadata: dict[str, Any] | None = None
    already_attached: bool = False

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["confidence"] = round(float(self.confidence), 2)
        data["metadata"] = self.metadata or {}
        return data


class EvidenceAssignmentEngine:
    """
    Suggests operational evidence for a mechanism-control relation.

    The engine is intentionally deterministic and human-in-the-loop: it only
    creates MechanismEvidence after the CISO approves a suggested candidate.
    """

    TOKEN_RE = re.compile(r"[\w-]+", re.UNICODE)

    INVENTORY_TERMS = {
        "asset", "assets", "ativo", "ativos", "inventario", "inventory",
        "software", "hardware", "classificacao", "classification",
    }
    VULNERABILITY_TERMS = {
        "vulnerabilidade", "vulnerabilidades", "vulnerability", "cve",
        "patch", "remediacao", "mitigacao", "wazuh", "epss", "nvd",
    }
    NETWORK_TERMS = {
        "rede", "network", "nmap", "scan", "descoberta", "discovery",
        "exposicao", "exposto", "perimetro", "firewall", "dmz",
    }
    GOVERNANCE_TERMS = {
        "politica", "policy", "procedimento", "procedure", "regulamento",
        "governance", "governacao", "documento", "evidencia",
    }

    @classmethod
    def suggestions_for_control_mechanism(cls, control_mechanism_id) -> dict[str, Any]:
        control_mechanism = ControlMechanism.objects.select_related(
            "control__framework", "mechanism"
        ).prefetch_related("mechanism__tags", "evidences").get(pk=control_mechanism_id)

        suggestions = cls._build_suggestions(control_mechanism)

        return {
            "control_mechanism": {
                "id": str(control_mechanism.id),
                "mechanism_title": control_mechanism.mechanism.title,
                "control_code": control_mechanism.control.code,
                "control_title": control_mechanism.control.title,
                "framework_name": control_mechanism.control.framework.name,
            },
            "suggestions": [suggestion.to_dict() for suggestion in suggestions],
        }

    @classmethod
    def apply_suggestion(cls, control_mechanism_id, suggestion_id: str) -> MechanismEvidence:
        control_mechanism = ControlMechanism.objects.select_related(
            "control__framework", "mechanism"
        ).prefetch_related("mechanism__tags", "evidences").get(pk=control_mechanism_id)

        suggestions = cls._build_suggestions(control_mechanism)
        selected = next((item for item in suggestions if item.id == suggestion_id), None)
        if not selected:
            raise ValueError("Sugestao de evidencia nao encontrada ou deixou de estar disponivel.")

        existing = cls._find_existing_evidence(control_mechanism, selected.title)
        if existing:
            return existing

        description = "\n\n".join(
            part for part in [
                selected.description,
                f"{AUTO_EVIDENCE_PREFIX} Fonte: {selected.source_label}.",
                f"Racional: {selected.rationale}",
                f"Confianca da sugestao: {round(selected.confidence * 100)}%.",
            ] if part
        )

        return MechanismEvidence.objects.create(
            control_mechanism=control_mechanism,
            title=selected.title,
            description=description,
            url=selected.url or "",
        )

    @classmethod
    def _build_suggestions(cls, control_mechanism: ControlMechanism) -> list[EvidenceSuggestion]:
        context_text = cls._context_text(control_mechanism)
        suggestions: list[EvidenceSuggestion] = []

        cls._collect_policy_evidence(control_mechanism, suggestions, context_text)
        cls._collect_policy_documents(control_mechanism, suggestions, context_text)
        cls._collect_technical_documents(control_mechanism, suggestions, context_text)
        cls._collect_asset_inventory(control_mechanism, suggestions, context_text)
        cls._collect_network_discovery(control_mechanism, suggestions, context_text)
        cls._collect_software_inventory(control_mechanism, suggestions, context_text)
        cls._collect_vulnerability_evidence(control_mechanism, suggestions, context_text)

        existing_titles = {
            cls._normalize_title(item.title)
            for item in control_mechanism.evidences.all()
        }

        deduped: dict[str, EvidenceSuggestion] = {}
        for suggestion in suggestions:
            suggestion.confidence = max(0.35, min(0.98, suggestion.confidence))
            suggestion.already_attached = cls._normalize_title(suggestion.title) in existing_titles
            current = deduped.get(suggestion.id)
            if current is None or suggestion.confidence > current.confidence:
                deduped[suggestion.id] = suggestion

        return sorted(
            deduped.values(),
            key=lambda item: (item.already_attached, -item.confidence, item.title.lower()),
        )

    @classmethod
    def _collect_policy_evidence(
        cls,
        control_mechanism: ControlMechanism,
        suggestions: list[EvidenceSuggestion],
        context_text: str,
    ) -> None:
        evidence_qs = (
            PolicyEvidence.objects
            .select_related("mechanism__policy_control__policy")
            .filter(mechanism__policy_control__control=control_mechanism.control)
            .order_by("-created_at")[:12]
        )

        for evidence in evidence_qs:
            policy = evidence.mechanism.policy_control.policy
            title = f"Evidencia formal: {evidence.title}"
            description = (
                f"Evidencia ja registada no mecanismo de politica '{evidence.mechanism.name}', "
                f"associado a politica {policy.code} - {policy.title}. "
                f"Tipo: {evidence.get_evidence_type_display()}. Estado: {evidence.get_status_display()}."
            )
            url = evidence.url or (evidence.file.url if evidence.file else "")
            confidence = 0.86 + cls._keyword_bonus(context_text, title, description)
            if evidence.status == "valid":
                confidence += 0.06

            suggestions.append(EvidenceSuggestion(
                id=f"policy-evidence:{evidence.id}",
                title=title,
                description=description,
                source_type="policy_evidence",
                source_label="Evidencia de politica",
                confidence=confidence,
                rationale="Evidencia existente ligada ao mesmo controlo de conformidade.",
                url=url,
                metadata={"policy": policy.code, "status": evidence.status},
            ))

    @classmethod
    def _collect_policy_documents(
        cls,
        control_mechanism: ControlMechanism,
        suggestions: list[EvidenceSuggestion],
        context_text: str,
    ) -> None:
        policy_controls = (
            PolicyControl.objects
            .select_related("policy")
            .filter(control=control_mechanism.control)
            .order_by("policy__code")[:10]
        )
        for policy_control in policy_controls:
            policy = policy_control.policy
            confidence = 0.64 + cls._keyword_bonus(context_text, policy.title, policy.description or "")
            if policy.status == Policy.Status.ACTIVE:
                confidence += 0.08

            suggestions.append(EvidenceSuggestion(
                id=f"policy-control:{policy_control.id}",
                title=f"Politica associada ao controlo: {policy.code}",
                description=(
                    f"A politica '{policy.title}' encontra-se associada ao controlo "
                    f"{control_mechanism.control.code}. "
                    f"Aplicabilidade: {policy_control.get_applicability_display()}. "
                    f"Prioridade: {policy_control.get_priority_display()}."
                ),
                source_type="policy",
                source_label="Politica de seguranca",
                confidence=confidence,
                rationale="Documento de governação associado ao mesmo controlo.",
                metadata={"policy": policy.code, "policy_status": policy.status},
            ))

    @classmethod
    def _collect_technical_documents(
        cls,
        control_mechanism: ControlMechanism,
        suggestions: list[EvidenceSuggestion],
        context_text: str,
    ) -> None:
        regulations = (
            TechnicalRegulation.objects
            .filter(controls=control_mechanism.control)
            .select_related("policy")
            .order_by("code")[:10]
        )
        for regulation in regulations:
            confidence = 0.72 + cls._keyword_bonus(
                context_text,
                regulation.title,
                " ".join(filter(None, [
                    regulation.description,
                    regulation.technical_objective,
                    regulation.technical_requirements,
                ])),
            )
            if regulation.status == "Active":
                confidence += 0.05

            suggestions.append(EvidenceSuggestion(
                id=f"technical-regulation:{regulation.id}",
                title=f"Regulamento tecnico: {regulation.code}",
                description=(
                    f"O regulamento tecnico '{regulation.title}' esta ligado ao controlo "
                    f"{control_mechanism.control.code}. Requisitos: "
                    f"{regulation.technical_requirements or 'nao especificados'}"
                ),
                source_type="technical_regulation",
                source_label="Regulamento tecnico",
                confidence=confidence,
                rationale="Regulamento tecnico relacionado diretamente com o controlo.",
                metadata={"code": regulation.code, "status": regulation.status},
            ))

        procedures = (
            Procedure.objects
            .filter(controls=control_mechanism.control)
            .select_related("policy", "technical_regulation")
            .order_by("code")[:10]
        )
        for procedure in procedures:
            confidence = 0.74 + cls._keyword_bonus(
                context_text,
                procedure.title,
                " ".join(filter(None, [
                    procedure.description,
                    procedure.steps,
                    procedure.expected_evidence,
                ])),
            )
            if procedure.status == "Active":
                confidence += 0.05

            suggestions.append(EvidenceSuggestion(
                id=f"procedure:{procedure.id}",
                title=f"Procedimento associado: {procedure.code}",
                description=(
                    f"O procedimento '{procedure.title}' esta ligado ao controlo "
                    f"{control_mechanism.control.code}. Evidencia esperada: "
                    f"{procedure.expected_evidence or 'nao especificada'}"
                ),
                source_type="procedure",
                source_label="Procedimento operacional",
                confidence=confidence,
                rationale="Procedimento operacional associado ao mesmo controlo.",
                metadata={"code": procedure.code, "status": procedure.status},
            ))

    @classmethod
    def _collect_asset_inventory(
        cls,
        control_mechanism: ControlMechanism,
        suggestions: list[EvidenceSuggestion],
        context_text: str,
    ) -> None:
        linked_assets = Asset.objects.filter(controls=control_mechanism.control)
        total_linked = linked_assets.count()
        if total_linked:
            source_counts = linked_assets.values("source").annotate(total=Count("id")).order_by("source")
            latest_sync = linked_assets.aggregate(latest=Max("last_sync_at"))["latest"]
            sample = list(linked_assets.order_by("name").values_list("name", flat=True)[:6])

            confidence = 0.77 + cls._keyword_bonus(context_text, "inventario ativos asset inventory", " ".join(sample))
            if total_linked >= 5:
                confidence += 0.04

            suggestions.append(EvidenceSuggestion(
                id=f"asset-inventory:{control_mechanism.control_id}",
                title="Inventario de ativos associado ao controlo",
                description=(
                    f"Existem {total_linked} ativo(s) associados ao controlo "
                    f"{control_mechanism.control.code}. Exemplos: {', '.join(sample) or 'sem amostra'}. "
                    f"Ultima sincronizacao conhecida: {latest_sync or 'sem data'}."
                ),
                source_type="asset_inventory",
                source_label="Inventario de ativos",
                confidence=confidence,
                rationale="Ativos diretamente associados ao controlo suportam a rastreabilidade do mecanismo.",
                metadata={
                    "asset_count": total_linked,
                    "source_counts": list(source_counts),
                    "latest_sync": latest_sync.isoformat() if latest_sync else None,
                },
            ))

        if cls._matches_any(context_text, cls.INVENTORY_TERMS):
            discovered = Asset.objects.filter(Q(source="wazuh") | Q(source="discovery") | Q(wazuh_agent_id__isnull=False))
            total_discovered = discovered.count()
            if total_discovered:
                latest = discovered.aggregate(latest=Max("last_sync_at"), latest_wazuh=Max("wazuh_last_seen"))
                sources = discovered.values("source").annotate(total=Count("id")).order_by("source")
                confidence = 0.67 + cls._keyword_bonus(context_text, "wazuh discovery inventario ativos", "")

                suggestions.append(EvidenceSuggestion(
                    id="asset-telemetry:discovered-assets",
                    title="Telemetria de ativos descoberta automaticamente",
                    description=(
                        f"A plataforma contem {total_discovered} ativo(s) com origem Wazuh, Nmap ou descoberta. "
                        f"Isto suporta evidencias de inventario, monitorizacao e cobertura operacional."
                    ),
                    source_type="asset_telemetry",
                    source_label="Wazuh/Nmap/Discovery",
                    confidence=confidence,
                    rationale="Dados operacionais recolhidos automaticamente podem evidenciar a existencia e monitorizacao dos ativos.",
                    metadata={
                        "asset_count": total_discovered,
                        "source_counts": list(sources),
                        "latest_sync": latest["latest"].isoformat() if latest["latest"] else None,
                        "latest_wazuh": latest["latest_wazuh"].isoformat() if latest["latest_wazuh"] else None,
                    },
                ))

    @classmethod
    def _collect_network_discovery(
        cls,
        control_mechanism: ControlMechanism,
        suggestions: list[EvidenceSuggestion],
        context_text: str,
    ) -> None:
        if not cls._matches_any(context_text, cls.NETWORK_TERMS):
            return

        ranges = NetworkRange.objects.filter(is_active=True).order_by("name")
        total_ranges = ranges.count()
        if total_ranges:
            sample = list(ranges.values_list("name", "cidr")[:6])
            formatted = ", ".join(f"{name} ({cidr})" for name, cidr in sample)

            suggestions.append(EvidenceSuggestion(
                id="network-ranges:active",
                title="Ambito de descoberta de rede configurado",
                description=(
                    f"Existem {total_ranges} rede(s) ativa(s) configuradas para descoberta. "
                    f"Amostra: {formatted}."
                ),
                source_type="network_discovery",
                source_label="Nmap / Redes",
                confidence=0.76 + cls._keyword_bonus(context_text, "nmap rede discovery scan perimetro", formatted),
                rationale="Redes ativas configuradas evidenciam capacidade de descoberta e monitorizacao do perimetro.",
                metadata={"network_range_count": total_ranges},
            ))

    @classmethod
    def _collect_software_inventory(
        cls,
        control_mechanism: ControlMechanism,
        suggestions: list[EvidenceSuggestion],
        context_text: str,
    ) -> None:
        if not cls._matches_any(context_text, {"software", "patch", "inventario", "inventory", "aplicacao", "sistema"}):
            return

        software = Software.objects.all()
        total = software.count()
        if not total:
            return

        source_counts = software.values("source").annotate(total=Count("id")).order_by("source")
        sample = list(software.order_by("name").values_list("name", "version")[:6])
        formatted = ", ".join(f"{name} {version}" for name, version in sample)

        suggestions.append(EvidenceSuggestion(
            id="software-inventory:all",
            title="Inventario de software registado",
            description=(
                f"A plataforma contem {total} registo(s) de software. "
                f"Amostra: {formatted or 'sem amostra'}."
            ),
            source_type="software_inventory",
            source_label="Inventario de software",
            confidence=0.70 + cls._keyword_bonus(context_text, "software patch inventario aplicacoes", formatted),
            rationale="Inventario de software suporta mecanismos de gestao de ativos, vulnerabilidades e patching.",
            metadata={"software_count": total, "source_counts": list(source_counts)},
        ))

    @classmethod
    def _collect_vulnerability_evidence(
        cls,
        control_mechanism: ControlMechanism,
        suggestions: list[EvidenceSuggestion],
        context_text: str,
    ) -> None:
        if not cls._matches_any(context_text, cls.VULNERABILITY_TERMS):
            return

        occurrences = AssetVulnerability.objects.select_related("asset", "vulnerability")
        linked_occurrences = occurrences.filter(
            Q(vulnerability__controls=control_mechanism.control) |
            Q(asset__controls=control_mechanism.control)
        ).distinct()

        total = linked_occurrences.count()
        if total == 0:
            total = occurrences.count()
            linked_occurrences = occurrences

        if total == 0:
            return

        mitigated = linked_occurrences.filter(status__in=["Mitigated", "Resolved"]).count()
        active = linked_occurrences.filter(status__in=["Open", "In remediation"]).count()
        latest = linked_occurrences.aggregate(latest=Max("last_seen"))["latest"]
        top = list(
            linked_occurrences
            .order_by("-vulnerability__cvss_score")
            .values_list("vulnerability__cve_id", "asset__name", "status")[:6]
        )
        formatted = ", ".join(f"{cve} em {asset} ({status})" for cve, asset, status in top)

        confidence = 0.72 + cls._keyword_bonus(context_text, "vulnerabilidade cve remediacao mitigacao patch", formatted)
        if mitigated:
            confidence += 0.06

        suggestions.append(EvidenceSuggestion(
            id=f"vulnerability-history:{control_mechanism.control_id}",
            title="Historico de vulnerabilidades e remediacao",
            description=(
                f"Foram encontrados {total} registo(s) de vulnerabilidades relevantes. "
                f"{mitigated} mitigado(s)/resolvido(s), {active} ainda ativo(s). "
                f"Amostra: {formatted or 'sem amostra'}."
            ),
            source_type="vulnerability_history",
            source_label="Vulnerabilidades / Wazuh / NVD",
            confidence=confidence,
            rationale="Historico operacional de vulnerabilidades suporta mecanismos de gestao de vulnerabilidades e remediacao.",
            metadata={
                "occurrence_count": total,
                "mitigated_or_resolved": mitigated,
                "active": active,
                "latest_seen": latest.isoformat() if latest else None,
            },
        ))

    @classmethod
    def _context_text(cls, control_mechanism: ControlMechanism) -> str:
        mechanism = control_mechanism.mechanism
        control = control_mechanism.control
        tag_names = " ".join(mechanism.tags.values_list("name", flat=True))
        return cls._normalize_text(" ".join(filter(None, [
            mechanism.title,
            mechanism.description,
            mechanism.mechanism_type,
            tag_names,
            control.code,
            control.title,
            control.description,
            control.framework.name,
            control.framework.code,
            control.framework.description,
            control_mechanism.acceptance_criteria,
        ])))

    @classmethod
    def _keyword_bonus(cls, context_text: str, *candidate_parts: str) -> float:
        candidate_text = cls._normalize_text(" ".join(filter(None, candidate_parts)))
        context_tokens = set(cls.TOKEN_RE.findall(context_text))
        candidate_tokens = set(cls.TOKEN_RE.findall(candidate_text))
        if not context_tokens or not candidate_tokens:
            return 0.0

        overlap = len(context_tokens & candidate_tokens)
        if overlap >= 10:
            return 0.10
        if overlap >= 6:
            return 0.07
        if overlap >= 3:
            return 0.04
        return 0.0

    @classmethod
    def _matches_any(cls, context_text: str, terms: set[str]) -> bool:
        tokens = set(cls.TOKEN_RE.findall(context_text))
        return bool(tokens & {cls._normalize_text(term) for term in terms})

    @staticmethod
    def _normalize_text(value: str | None) -> str:
        value = (value or "").lower()
        replacements = str.maketrans({
            "á": "a", "à": "a", "ã": "a", "â": "a",
            "é": "e", "ê": "e",
            "í": "i",
            "ó": "o", "õ": "o", "ô": "o",
            "ú": "u",
            "ç": "c",
        })
        return value.translate(replacements)

    @classmethod
    def _normalize_title(cls, value: str | None) -> str:
        text = cls._normalize_text(value)
        return re.sub(r"\s+", " ", text).strip()

    @classmethod
    def _find_existing_evidence(
        cls,
        control_mechanism: ControlMechanism,
        title: str,
    ) -> MechanismEvidence | None:
        normalized = cls._normalize_title(title)
        for evidence in control_mechanism.evidences.all():
            if cls._normalize_title(evidence.title) == normalized:
                return evidence
        return None