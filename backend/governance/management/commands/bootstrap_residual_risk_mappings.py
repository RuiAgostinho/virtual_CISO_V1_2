import unicodedata
from decimal import Decimal

from django.apps import apps
from django.core.management.base import BaseCommand

from governance.models import (
    GovernanceRiskLink,
    InternalControl,
    InternalControlMechanism,
)


class Command(BaseCommand):
    help = (
        "Cria mapeamentos rule-based entre riscos/ativos/vulnerabilidades e a "
        "nova camada de governance, deixando-os em pending_review para validacao humana."
    )

    CONTROL_RULES = {
        "IC-RISK-001": {
            "relationship": GovernanceRiskLink.RelationshipType.MITIGATES,
            "effectiveness": 45,
            "residual": 12,
            "confidence": 75,
            "reason": "governo de risco e criterios de tratamento.",
        },
        "IC-ASSET-001": {
            "relationship": GovernanceRiskLink.RelationshipType.MONITORS,
            "effectiveness": 50,
            "residual": 10,
            "confidence": 75,
            "reason": "inventario, classificacao e ownership dos ativos.",
        },
        "IC-VUL-001": {
            "relationship": GovernanceRiskLink.RelationshipType.REDUCES_LIKELIHOOD,
            "effectiveness": 70,
            "residual": 25,
            "confidence": 85,
            "reason": "gestao de vulnerabilidades, priorizacao e correcao.",
        },
        "IC-NET-001": {
            "relationship": GovernanceRiskLink.RelationshipType.PREVENTS,
            "effectiveness": 65,
            "residual": 18,
            "confidence": 80,
            "reason": "seguranca de redes, segmentacao e controlos perimetrais.",
        },
        "IC-LOG-001": {
            "relationship": GovernanceRiskLink.RelationshipType.DETECTS,
            "effectiveness": 55,
            "residual": 12,
            "confidence": 75,
            "reason": "logging, monitorizacao e capacidade de detecao.",
        },
        "IC-INC-001": {
            "relationship": GovernanceRiskLink.RelationshipType.REDUCES_IMPACT,
            "effectiveness": 60,
            "residual": 15,
            "confidence": 75,
            "reason": "resposta a incidentes e reducao do impacto operacional.",
        },
        "IC-BCM-001": {
            "relationship": GovernanceRiskLink.RelationshipType.REDUCES_IMPACT,
            "effectiveness": 55,
            "residual": 15,
            "confidence": 70,
            "reason": "continuidade, backup e recuperacao.",
        },
        "IC-AC-001": {
            "relationship": GovernanceRiskLink.RelationshipType.PREVENTS,
            "effectiveness": 65,
            "residual": 18,
            "confidence": 78,
            "reason": "autenticacao forte e controlo de identidades.",
        },
        "IC-AC-002": {
            "relationship": GovernanceRiskLink.RelationshipType.PREVENTS,
            "effectiveness": 65,
            "residual": 18,
            "confidence": 78,
            "reason": "gestao de privilegios e acessos administrativos.",
        },
        "IC-DEV-001": {
            "relationship": GovernanceRiskLink.RelationshipType.PREVENTS,
            "effectiveness": 55,
            "residual": 14,
            "confidence": 70,
            "reason": "configuracao segura, alteracoes e seguranca no desenvolvimento.",
        },
        "IC-DP-001": {
            "relationship": GovernanceRiskLink.RelationshipType.REDUCES_IMPACT,
            "effectiveness": 55,
            "residual": 14,
            "confidence": 70,
            "reason": "protecao de dados, confidencialidade e criptografia.",
        },
        "IC-PHY-001": {
            "relationship": GovernanceRiskLink.RelationshipType.PREVENTS,
            "effectiveness": 60,
            "residual": 14,
            "confidence": 70,
            "reason": "seguranca fisica e ambiental.",
        },
        "IC-SUP-001": {
            "relationship": GovernanceRiskLink.RelationshipType.MONITORS,
            "effectiveness": 45,
            "residual": 10,
            "confidence": 65,
            "reason": "gestao de fornecedores e cadeia de abastecimento.",
        },
    }

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Mostra o que seria criado sem gravar na BD.")
        parser.add_argument("--max-risks", type=int, default=100)
        parser.add_argument("--max-assets", type=int, default=100)
        parser.add_argument("--max-vulnerabilities", type=int, default=50)
        parser.add_argument("--max-mechanisms-per-control", type=int, default=2)
        parser.add_argument(
            "--validation-status",
            choices=[
                GovernanceRiskLink.ValidationStatus.DRAFT,
                GovernanceRiskLink.ValidationStatus.PENDING_REVIEW,
            ],
            default=GovernanceRiskLink.ValidationStatus.PENDING_REVIEW,
        )

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.validation_status = options["validation_status"]
        self.max_mechanisms_per_control = options["max_mechanisms_per_control"]
        self.planned_keys = set()
        self.stats = {
            "risks": 0,
            "assets": 0,
            "vulnerabilities": 0,
            "created": 0,
            "existing": 0,
            "would_create": 0,
            "skipped": 0,
            "warnings": [],
        }

        self.controls = self._load_controls()
        self.mechanisms_by_control = self._load_mechanisms_by_control()

        self._map_risks(limit=options["max_risks"])
        self._map_assets(limit=options["max_assets"])
        self._map_vulnerabilities(limit=options["max_vulnerabilities"])
        self._print_summary()

    def _load_controls(self):
        controls = {
            control.code: control
            for control in InternalControl.objects.filter(code__in=self.CONTROL_RULES.keys(), is_active=True)
        }
        missing = sorted(set(self.CONTROL_RULES) - set(controls))
        if missing:
            self.stats["warnings"].append(
                "Controlos internos canonicos em falta: " + ", ".join(missing)
            )
        return controls

    def _load_mechanisms_by_control(self):
        excluded = [
            InternalControlMechanism.ValidationStatus.REJECTED,
            InternalControlMechanism.ValidationStatus.DEPRECATED,
        ]
        grouped = {}
        links = (
            InternalControlMechanism.objects.select_related("internal_control", "mechanism")
            .filter(internal_control__code__in=self.CONTROL_RULES.keys())
            .exclude(validation_status__in=excluded)
            .order_by(
                "internal_control__code",
                "-mandatory",
                "-contribution_weight",
                "mechanism__title",
            )
        )
        for link in links:
            grouped.setdefault(link.internal_control.code, []).append(link)
        return grouped

    def _map_risks(self, limit):
        Risk = apps.get_model("risk", "Risk")
        risks = Risk.objects.select_related("asset", "vulnerability").order_by("-risk_score")[:limit]
        for risk in risks:
            self.stats["risks"] += 1
            label = self._risk_label(risk)
            for code in self._risk_control_codes(risk):
                self._create_control_and_mechanism_links(
                    code=code,
                    target_type=GovernanceRiskLink.TargetType.RISK,
                    target_id=risk.id,
                    target_label=label,
                )

    def _map_assets(self, limit):
        Asset = apps.get_model("risk", "Asset")
        assets = Asset.objects.order_by("name")[:limit]
        for asset in assets:
            self.stats["assets"] += 1
            label = getattr(asset, "name", str(asset.id))
            for code in self._asset_control_codes(asset):
                self._create_control_and_mechanism_links(
                    code=code,
                    target_type=GovernanceRiskLink.TargetType.ASSET,
                    target_id=asset.id,
                    target_label=label,
                )

    def _map_vulnerabilities(self, limit):
        Vulnerability = apps.get_model("risk", "Vulnerability")
        vulnerabilities = (
            Vulnerability.objects.filter(severity__in=["High", "Critical"])
            .order_by("-cvss_score", "cve_id")[:limit]
        )
        for vulnerability in vulnerabilities:
            self.stats["vulnerabilities"] += 1
            label = getattr(vulnerability, "cve_id", str(vulnerability.id))
            for code in self._vulnerability_control_codes(vulnerability):
                self._create_control_and_mechanism_links(
                    code=code,
                    target_type=GovernanceRiskLink.TargetType.VULNERABILITY,
                    target_id=vulnerability.id,
                    target_label=label,
                )

    def _risk_control_codes(self, risk):
        text = self._risk_text(risk)
        codes = ["IC-RISK-001", "IC-ASSET-001"]
        if getattr(risk, "vulnerability_id", None):
            codes.extend(["IC-VUL-001", "IC-LOG-001"])
        if getattr(risk, "risk_level", "") in {"high", "critical"} or float(getattr(risk, "risk_score", 0) or 0) >= 60:
            codes.extend(["IC-INC-001", "IC-BCM-001"])
        codes.extend(self._contextual_control_codes(text))
        return self._unique_codes(codes)

    def _asset_control_codes(self, asset):
        text = self._asset_text(asset)
        codes = ["IC-ASSET-001", "IC-RISK-001"]
        criticality = self._normalise(getattr(asset, "criticality", ""))
        if criticality in {"critical", "high", "critico", "alto"}:
            codes.extend(["IC-BCM-001", "IC-LOG-001"])
        codes.extend(self._contextual_control_codes(text))
        return self._unique_codes(codes)

    def _vulnerability_control_codes(self, vulnerability):
        text = self._vulnerability_text(vulnerability)
        codes = ["IC-VUL-001", "IC-LOG-001"]
        severity = self._normalise(getattr(vulnerability, "severity", ""))
        if severity in {"high", "critical"} or self._decimal(getattr(vulnerability, "cvss_score", 0)) >= Decimal("7.0"):
            codes.append("IC-INC-001")
        codes.extend(self._contextual_control_codes(text))
        return self._unique_codes(codes)

    def _contextual_control_codes(self, text):
        codes = []
        if self._contains_any(text, ["router", "firewall", "switch", "gateway", "vpn", "rede", "network", "tcp", "udp", "http", "ssl", "tls", "nmap", "host"]):
            codes.append("IC-NET-001")
        if self._contains_any(text, ["auth", "password", "credential", "privilege", "login", "identity", "access", "conta", "credencial", "autenticacao", "acesso"]):
            codes.extend(["IC-AC-001", "IC-AC-002"])
        if self._contains_any(text, ["database", "postgres", "sql", "dados", "confidential", "information disclosure", "leak", "encryption", "criptografia"]):
            codes.append("IC-DP-001")
        if self._contains_any(text, ["deserialization", "traversal", "xss", "injection", "code execution", "rce", "configuration", "configuracao", "patch", "update"]):
            codes.append("IC-DEV-001")
        if self._contains_any(text, ["camera", "iot", "facility", "physical", "fisic", "ambiental", "edificio"]):
            codes.append("IC-PHY-001")
        if self._contains_any(text, ["supplier", "fornecedor", "third party", "terceiro", "vendor"]):
            codes.append("IC-SUP-001")
        return codes

    def _create_control_and_mechanism_links(self, code, target_type, target_id, target_label):
        control = self.controls.get(code)
        if not control:
            self.stats["skipped"] += 1
            return

        rule = self.CONTROL_RULES[code]
        self._create_link(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            source_id=control.id,
            target_type=target_type,
            target_id=target_id,
            relationship_type=rule["relationship"],
            effectiveness=rule["effectiveness"],
            residual=rule["residual"],
            confidence=rule["confidence"],
            rationale=self._rationale(control.code, control.title, target_label, rule["reason"]),
        )

        for mechanism_link in self.mechanisms_by_control.get(code, [])[: self.max_mechanisms_per_control]:
            self._create_link(
                source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL_MECHANISM,
                source_id=mechanism_link.id,
                target_type=target_type,
                target_id=target_id,
                relationship_type=self._relationship_for_mechanism(mechanism_link, rule["relationship"]),
                effectiveness=min(Decimal("100"), self._decimal(rule["effectiveness"]) + Decimal("5")),
                residual=max(Decimal("5"), min(Decimal("18"), self._decimal(mechanism_link.contribution_weight) * Decimal("0.15"))),
                confidence=max(Decimal("60"), self._decimal(mechanism_link.confidence_score) or Decimal("70")),
                rationale=self._rationale(
                    f"{mechanism_link.internal_control.code} / {mechanism_link.mechanism.title}",
                    "mecanismo contextualizado",
                    target_label,
                    "operacionaliza o controlo interno no contexto deste risco.",
                ),
            )

    def _create_link(
        self,
        source_type,
        source_id,
        target_type,
        target_id,
        relationship_type,
        effectiveness,
        residual,
        confidence,
        rationale,
    ):
        key = (
            source_type,
            str(source_id),
            target_type,
            str(target_id),
            relationship_type,
        )
        if key in self.planned_keys:
            self.stats["skipped"] += 1
            return
        self.planned_keys.add(key)

        exists = GovernanceRiskLink.objects.filter(
            source_type=source_type,
            source_id=str(source_id),
            target_type=target_type,
            target_id=str(target_id),
            relationship_type=relationship_type,
        ).exists()
        if exists:
            self.stats["existing"] += 1
            return

        if self.dry_run:
            self.stats["would_create"] += 1
            return

        GovernanceRiskLink.objects.create(
            source_type=source_type,
            source_id=str(source_id),
            target_type=target_type,
            target_id=str(target_id),
            relationship_type=relationship_type,
            effectiveness_percentage=self._decimal(effectiveness),
            residual_impact_percentage=self._decimal(residual),
            rationale=rationale,
            mapping_source=GovernanceRiskLink.MappingSource.RULE_BASED,
            validation_status=self.validation_status,
            confidence_score=self._decimal(confidence),
        )
        self.stats["created"] += 1

    def _relationship_for_mechanism(self, mechanism_link, fallback):
        mapping = {
            InternalControlMechanism.RelationshipType.PREVENTIVE: GovernanceRiskLink.RelationshipType.PREVENTS,
            InternalControlMechanism.RelationshipType.DETECTIVE: GovernanceRiskLink.RelationshipType.DETECTS,
            InternalControlMechanism.RelationshipType.CORRECTIVE: GovernanceRiskLink.RelationshipType.REDUCES_IMPACT,
            InternalControlMechanism.RelationshipType.COMPENSATING: GovernanceRiskLink.RelationshipType.COMPENSATES,
        }
        return mapping.get(mechanism_link.relationship_type, fallback)

    def _rationale(self, source_label, source_title, target_label, reason):
        return (
            "Mapeamento rule-based para validacao humana: "
            f"{source_label} - {source_title} foi associado a {target_label} porque suporta {reason} "
            "Deve ser revisto pelo CISO antes de ser considerado oficial."
        )

    def _risk_text(self, risk):
        return self._normalise(
            " ".join(
                [
                    self._risk_label(risk),
                    getattr(risk, "ai_explanation", "") or "",
                    self._asset_text(getattr(risk, "asset", None)),
                    self._vulnerability_text(getattr(risk, "vulnerability", None)),
                ]
            )
        )

    def _asset_text(self, asset):
        if not asset:
            return ""
        fields = [
            getattr(asset, "name", ""),
            getattr(asset, "description", ""),
            getattr(asset, "asset_type", ""),
            getattr(asset, "criticality", ""),
            getattr(asset, "exposure", ""),
            getattr(asset, "source", ""),
            getattr(getattr(asset, "category", None), "name", ""),
            getattr(getattr(asset, "type", None), "name", ""),
        ]
        return self._normalise(" ".join(str(value or "") for value in fields))

    def _vulnerability_text(self, vulnerability):
        if not vulnerability:
            return ""
        fields = [
            getattr(vulnerability, "cve_id", ""),
            getattr(vulnerability, "severity", ""),
            getattr(vulnerability, "description", ""),
            getattr(vulnerability, "mitigation", ""),
            getattr(vulnerability, "source", ""),
            getattr(vulnerability, "cvss_score", ""),
        ]
        return self._normalise(" ".join(str(value or "") for value in fields))

    def _risk_label(self, risk):
        asset_name = getattr(getattr(risk, "asset", None), "name", "")
        vulnerability = getattr(risk, "vulnerability", None)
        vulnerability_label = getattr(vulnerability, "cve_id", "") if vulnerability else "risco de ativo"
        return " - ".join(value for value in [asset_name, vulnerability_label] if value)

    def _contains_any(self, text, needles):
        return any(needle in text for needle in needles)

    def _unique_codes(self, codes):
        seen = set()
        result = []
        for code in codes:
            if code not in seen:
                seen.add(code)
                result.append(code)
        return result

    def _normalise(self, value):
        text = str(value or "").lower()
        return "".join(
            char for char in unicodedata.normalize("NFKD", text) if not unicodedata.combining(char)
        )

    def _decimal(self, value):
        if value in (None, ""):
            return Decimal("0")
        return Decimal(str(value))

    def _print_summary(self):
        action = "Dry-run" if self.dry_run else "Bootstrap"
        self.stdout.write(self.style.SUCCESS(f"{action} de mapeamentos de risco residual concluido."))
        self.stdout.write(f"Riscos analisados: {self.stats['risks']}")
        self.stdout.write(f"Ativos analisados: {self.stats['assets']}")
        self.stdout.write(f"Vulnerabilidades analisadas: {self.stats['vulnerabilities']}")
        self.stdout.write(f"Mappings criados: {self.stats['created']}")
        self.stdout.write(f"Mappings que seriam criados: {self.stats['would_create']}")
        self.stdout.write(f"Mappings ja existentes: {self.stats['existing']}")
        self.stdout.write(f"Mappings ignorados: {self.stats['skipped']}")
        self.stdout.write(
            "Estado aplicado aos novos mappings: "
            f"{self.validation_status}; origem: {GovernanceRiskLink.MappingSource.RULE_BASED}."
        )
        if self.stats["warnings"]:
            self.stdout.write(self.style.WARNING("Avisos:"))
            for warning in self.stats["warnings"]:
                self.stdout.write(f"- {warning}")
        else:
            self.stdout.write("Avisos: 0")
