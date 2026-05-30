import os
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import (
    Control,
    EvidenceLink,
    GovernanceDocumentControl,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    PolicyInternalControl,
)


class Command(BaseCommand):
    help = (
        "Cria um catalogo interno canonico de controlos agnosticos de frameworks "
        "e mapeia controlos externos para esse catalogo."
    )

    CANONICAL_CONTROLS = [
        {
            "code": "IC-AC-001",
            "title": "Autenticacao forte e gestao de identidades",
            "domain": "Controlo de acessos",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Garantir que identidades, autenticacao e acesso logico sao geridos de forma controlada.",
            "risk": "Acessos indevidos podem permitir divulgacao, alteracao ou destruicao nao autorizada de informacao.",
            "keywords": [
                "access",
                "authentication",
                "authenticator",
                "identity",
                "identidade",
                "autenticacao",
                "mfa",
                "password",
                "senha",
                "credential",
                "credencial",
                "login",
                "user account",
            ],
            "code_prefixes": ["PR.AA", "PR.AC", "PR.AC-", "AC"],
        },
        {
            "code": "IC-AC-002",
            "title": "Gestao de privilegios e acessos administrativos",
            "domain": "Controlo de acessos",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Controlar contas privilegiadas, autorizacoes elevadas e segregacao de funcoes.",
            "risk": "Privilegios excessivos ou mal controlados podem acelerar compromisso sistemico.",
            "keywords": [
                "privileged",
                "privilege",
                "admin",
                "administrator",
                "administrador",
                "segregation",
                "segregacao",
                "least privilege",
                "minimum privilege",
                "privilegio",
                "privilegios",
            ],
            "code_prefixes": [],
        },
        {
            "code": "IC-AC-003",
            "title": "Ciclo de vida de acessos",
            "domain": "Controlo de acessos",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Gerir concessao, revisao, alteracao e remocao de acessos durante o ciclo de vida.",
            "risk": "Acessos acumulados ou nao revogados aumentam a probabilidade de abuso ou intrusao.",
            "keywords": [
                "lifecycle",
                "joiner",
                "mover",
                "leaver",
                "offboarding",
                "onboarding",
                "review of access",
                "access review",
                "revocation",
                "revogacao",
                "remocao",
                "termination",
            ],
            "code_prefixes": [],
        },
        {
            "code": "IC-GOV-001",
            "title": "Governo de seguranca da informacao",
            "domain": "Governance",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Definir responsabilidades, politicas, estruturas de governo e supervisao de seguranca.",
            "risk": "Sem governo claro, a organizacao perde alinhamento, responsabilizacao e capacidade de controlo.",
            "keywords": [
                "governance",
                "govern",
                "policy",
                "policies",
                "politica",
                "leadership",
                "responsibilities",
                "roles",
                "organizational",
                "organizational security",
                "supervision",
                "oversight",
                "gestao da seguranca",
            ],
            "code_prefixes": ["GV", "GV.OC", "GV.OV", "GV.PO", "GV.RR"],
        },
        {
            "code": "IC-RISK-001",
            "title": "Gestao de risco de ciberseguranca",
            "domain": "Risco",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Identificar, avaliar, tratar e monitorizar riscos de ciberseguranca.",
            "risk": "Riscos nao identificados ou mal tratados podem originar impactos relevantes para o negocio.",
            "keywords": [
                "risk",
                "risco",
                "assessment",
                "analise de risco",
                "risk management",
                "risk strategy",
                "threat",
                "ameaca",
            ],
            "code_prefixes": ["ID.RA", "GV.RM"],
        },
        {
            "code": "IC-ASSET-001",
            "title": "Inventario e classificacao de ativos",
            "domain": "Ativos",
            "criticality": InternalControl.Criticality.MEDIUM,
            "objective": "Manter inventario, propriedade, classificacao e criticidade de ativos de informacao.",
            "risk": "Ativos desconhecidos ou mal classificados tendem a ficar desprotegidos.",
            "keywords": [
                "asset",
                "assets",
                "ativo",
                "ativos",
                "inventory",
                "inventario",
                "classification",
                "classificacao",
                "ownership",
                "owner",
            ],
            "code_prefixes": ["ID.AM"],
        },
        {
            "code": "IC-LOG-001",
            "title": "Logging, monitorizacao e detecao",
            "domain": "Monitorizacao",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Recolher eventos relevantes, monitorizar comportamentos e detetar incidentes de seguranca.",
            "risk": "Sem logs e detecao, incidentes podem permanecer invisiveis ate causarem danos significativos.",
            "keywords": [
                "log",
                "logging",
                "monitor",
                "monitoring",
                "detec",
                "detect",
                "siem",
                "alert",
                "event",
                "audit trail",
                "registo",
            ],
            "code_prefixes": ["DE"],
        },
        {
            "code": "IC-INC-001",
            "title": "Gestao e resposta a incidentes",
            "domain": "Incidentes",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Preparar, responder, comunicar e aprender com incidentes de ciberseguranca.",
            "risk": "Resposta inadequada a incidentes aumenta impacto operacional, legal e reputacional.",
            "keywords": [
                "incident",
                "incidente",
                "response",
                "resposta",
                "crisis",
                "playbook",
                "communication",
                "comunicacao",
            ],
            "code_prefixes": ["RS"],
        },
        {
            "code": "IC-VUL-001",
            "title": "Gestao de vulnerabilidades e correcao",
            "domain": "Vulnerabilidades",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Identificar, priorizar, remediar e acompanhar vulnerabilidades tecnicas.",
            "risk": "Vulnerabilidades nao corrigidas podem ser exploradas por atacantes ou causar falhas de conformidade.",
            "keywords": [
                "vulnerability",
                "vulnerabil",
                "patch",
                "remediation",
                "remediacao",
                "scan",
                "penetration",
                "pentest",
                "technical vulnerability",
            ],
            "code_prefixes": [],
        },
        {
            "code": "IC-BCM-001",
            "title": "Continuidade, backup e recuperacao",
            "domain": "Continuidade",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Garantir continuidade operacional, backups, recuperacao e resiliencia.",
            "risk": "Falhas de continuidade podem interromper servicos criticos e comprometer recuperacao.",
            "keywords": [
                "backup",
                "recovery",
                "recover",
                "continuity",
                "continuidade",
                "resilience",
                "resiliencia",
                "restore",
                "disaster",
                "rc.",
            ],
            "code_prefixes": ["RC"],
        },
        {
            "code": "IC-SUP-001",
            "title": "Gestao de fornecedores e cadeia de abastecimento",
            "domain": "Fornecedores",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Gerir riscos de terceiros, fornecedores, prestadores e cadeia de abastecimento.",
            "risk": "Dependencias externas podem introduzir riscos nao controlados na organizacao.",
            "keywords": [
                "supplier",
                "vendor",
                "third party",
                "third-party",
                "provider",
                "supply chain",
                "fornecedor",
                "terceiro",
                "prestador",
                "outsourc",
            ],
            "code_prefixes": ["GV.SC"],
        },
        {
            "code": "IC-DP-001",
            "title": "Protecao de dados e criptografia",
            "domain": "Protecao de dados",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Proteger dados em repouso, em transito e durante o seu ciclo de vida.",
            "risk": "Exposicao ou tratamento inadequado de dados pode gerar impacto legal, operacional e reputacional.",
            "keywords": [
                "data",
                "dados",
                "privacy",
                "privacidade",
                "personal data",
                "encrypt",
                "encryption",
                "cryptograph",
                "confidentiality",
                "confidencialidade",
                "information transfer",
            ],
            "code_prefixes": ["PR.DS"],
        },
        {
            "code": "IC-NET-001",
            "title": "Seguranca de redes e comunicacoes",
            "domain": "Redes",
            "criticality": InternalControl.Criticality.HIGH,
            "objective": "Proteger redes, comunicacoes, segmentacao e servicos expostos.",
            "risk": "Redes mal segmentadas ou expostas podem facilitar movimento lateral e intrusao.",
            "keywords": [
                "network",
                "rede",
                "networks",
                "communication",
                "comunicacao",
                "segmentation",
                "segmentacao",
                "firewall",
                "wireless",
                "remote access",
                "dns",
            ],
            "code_prefixes": ["PR.PT"],
        },
        {
            "code": "IC-DEV-001",
            "title": "Seguranca no desenvolvimento, configuracao e alteracoes",
            "domain": "Desenvolvimento seguro",
            "criticality": InternalControl.Criticality.MEDIUM,
            "objective": "Integrar seguranca no desenvolvimento, alteracoes, configuracao e operacao tecnica.",
            "risk": "Alteracoes inseguras e configuracoes fracas podem introduzir vulnerabilidades.",
            "keywords": [
                "development",
                "software",
                "secure coding",
                "change",
                "configuration",
                "configuracao",
                "alteracao",
                "maintenance",
                "hardening",
                "secure engineering",
            ],
            "code_prefixes": ["PR.IP", "PR.MA"],
        },
        {
            "code": "IC-AWARE-001",
            "title": "Formacao e consciencializacao",
            "domain": "Pessoas",
            "criticality": InternalControl.Criticality.MEDIUM,
            "objective": "Desenvolver consciencializacao, competencias e comportamento seguro.",
            "risk": "Falhas humanas nao mitigadas aumentam risco de phishing, erro operacional e incumprimento.",
            "keywords": [
                "awareness",
                "training",
                "formacao",
                "consciencializacao",
                "competence",
                "education",
                "people",
                "human resources",
            ],
            "code_prefixes": ["PR.AT"],
        },
        {
            "code": "IC-PHY-001",
            "title": "Seguranca fisica e ambiental",
            "domain": "Seguranca fisica",
            "criticality": InternalControl.Criticality.MEDIUM,
            "objective": "Proteger instalacoes, equipamentos e areas fisicas relevantes.",
            "risk": "Acesso fisico indevido pode comprometer pessoas, ativos, dados e servicos.",
            "keywords": [
                "physical",
                "fisic",
                "environment",
                "ambiental",
                "facility",
                "facilities",
                "premises",
                "perimeter",
                "cctv",
                "surveillance",
                "videovigilancia",
            ],
            "code_prefixes": [],
            "section_prefixes": ["7"],
        },
        {
            "code": "IC-EVID-001",
            "title": "Evidencias, auditoria e melhoria continua",
            "domain": "Auditoria e melhoria",
            "criticality": InternalControl.Criticality.MEDIUM,
            "objective": "Manter evidencias, auditorias, findings e melhoria continua de seguranca.",
            "risk": "Sem evidencias e auditoria, a conformidade nao e demonstravel nem melhoravel.",
            "keywords": [
                "audit",
                "auditoria",
                "evidence",
                "evidencia",
                "improvement",
                "melhoria",
                "review",
                "measurement",
                "metrics",
                "compliance",
            ],
            "code_prefixes": [],
        },
    ]

    FALLBACK_CODE = "IC-GOV-001"
    ISO27002_CODE_MAP = {
        "a.5.1": "IC-GOV-001",
        "a.5.2": "IC-GOV-001",
        "a.5.3": "IC-AC-002",
        "a.5.4": "IC-GOV-001",
        "a.5.5": "IC-GOV-001",
        "a.5.6": "IC-GOV-001",
        "a.5.7": "IC-RISK-001",
        "a.5.8": "IC-DEV-001",
        "a.5.9": "IC-ASSET-001",
        "a.5.10": "IC-ASSET-001",
        "a.5.11": "IC-ASSET-001",
        "a.5.12": "IC-ASSET-001",
        "a.5.13": "IC-ASSET-001",
        "a.5.14": "IC-DP-001",
        "a.5.15": "IC-AC-001",
        "a.5.16": "IC-AC-001",
        "a.5.17": "IC-AC-001",
        "a.5.18": "IC-AC-003",
        "a.5.19": "IC-SUP-001",
        "a.5.20": "IC-SUP-001",
        "a.5.21": "IC-SUP-001",
        "a.5.22": "IC-SUP-001",
        "a.5.23": "IC-SUP-001",
        "a.5.24": "IC-INC-001",
        "a.5.25": "IC-INC-001",
        "a.5.26": "IC-INC-001",
        "a.5.27": "IC-INC-001",
        "a.5.28": "IC-EVID-001",
        "a.5.29": "IC-BCM-001",
        "a.5.30": "IC-BCM-001",
        "a.5.31": "IC-GOV-001",
        "a.5.32": "IC-DP-001",
        "a.5.33": "IC-DP-001",
        "a.5.34": "IC-DP-001",
        "a.5.35": "IC-EVID-001",
        "a.5.36": "IC-EVID-001",
        "a.5.37": "IC-GOV-001",
        "b.6.1": "IC-AWARE-001",
        "b.6.2": "IC-AWARE-001",
        "b.6.3": "IC-AWARE-001",
        "b.6.4": "IC-GOV-001",
        "b.6.5": "IC-AC-003",
        "b.6.6": "IC-GOV-001",
        "b.6.7": "IC-AC-001",
        "b.6.8": "IC-INC-001",
        "c.7.1": "IC-PHY-001",
        "c.7.2": "IC-PHY-001",
        "c.7.3": "IC-PHY-001",
        "c.7.4": "IC-PHY-001",
        "c.7.5": "IC-PHY-001",
        "c.7.6": "IC-PHY-001",
        "c.7.7": "IC-PHY-001",
        "c.7.8": "IC-PHY-001",
        "c.7.9": "IC-PHY-001",
        "c.7.10": "IC-PHY-001",
        "c.7.11": "IC-PHY-001",
        "c.7.12": "IC-PHY-001",
        "c.7.13": "IC-PHY-001",
        "c.7.14": "IC-PHY-001",
        "d.8.1": "IC-ASSET-001",
        "d.8.2": "IC-AC-002",
        "d.8.3": "IC-AC-001",
        "d.8.4": "IC-DEV-001",
        "d.8.5": "IC-AC-001",
        "d.8.6": "IC-BCM-001",
        "d.8.7": "IC-DEV-001",
        "d.8.8": "IC-VUL-001",
        "d.8.9": "IC-DEV-001",
        "d.8.10": "IC-DP-001",
        "d.8.11": "IC-DP-001",
        "d.8.12": "IC-DP-001",
        "d.8.13": "IC-BCM-001",
        "d.8.14": "IC-BCM-001",
        "d.8.15": "IC-LOG-001",
        "d.8.16": "IC-LOG-001",
        "d.8.17": "IC-LOG-001",
        "d.8.18": "IC-DEV-001",
        "d.8.19": "IC-DEV-001",
        "d.8.20": "IC-NET-001",
        "d.8.21": "IC-NET-001",
        "d.8.22": "IC-NET-001",
        "d.8.23": "IC-NET-001",
        "d.8.24": "IC-DP-001",
        "d.8.25": "IC-DEV-001",
        "d.8.26": "IC-DEV-001",
        "d.8.27": "IC-DEV-001",
        "d.8.28": "IC-DEV-001",
        "d.8.29": "IC-VUL-001",
        "d.8.30": "IC-SUP-001",
        "d.8.31": "IC-DEV-001",
        "d.8.32": "IC-DEV-001",
        "d.8.33": "IC-DP-001",
        "d.8.34": "IC-EVID-001",
    }
    RULE_RATIONALE = (
        "Mapeamento rule-based para catalogo interno canonico com base em codigo, "
        "seccao e palavras-chave do controlo externo. Requer validacao humana no Mapping Review."
    )
    LINK_RATIONALE = "Ligacao copiada para controlo interno canonico a partir de {legacy_code}."

    def add_arguments(self, parser):
        parser.add_argument(
            "--approve",
            action="store_true",
            help="Cria mappings canonicos como approved. Por defeito ficam pending_review.",
        )
        parser.add_argument(
            "--deprecate-legacy",
            action="store_true",
            help=(
                "Marca mappings 1:1 migrados como deprecated e oculta InternalControls migrados "
                "quando ja existe mapping canonico."
            ),
        )
        parser.add_argument(
            "--deprecate-stale-rule-based",
            action="store_true",
            help="Marca mappings rule_based antigos para outro controlo canonico como deprecated.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simula a normalizacao sem gravar alteracoes.",
        )

    def handle(self, *args, **options):
        os.environ.setdefault("VIRTUAL_CISO_DISABLE_RAG_SIGNALS", "1")
        self.approve = options["approve"]
        self.deprecate_legacy = options["deprecate_legacy"]
        self.deprecate_stale_rule_based = options["deprecate_stale_rule_based"]
        self.dry_run = options["dry_run"]
        self.validation_status = (
            InternalControlFrameworkMapping.ValidationStatus.APPROVED
            if self.approve
            else InternalControlFrameworkMapping.ValidationStatus.PENDING_REVIEW
        )

        stats = {
            "canonical_created": 0,
            "canonical_existing": 0,
            "controls_analyzed": 0,
            "framework_mappings_created": 0,
            "framework_mappings_existing": 0,
            "framework_mappings_reactivated": 0,
            "policy_links_created": 0,
            "policy_links_existing": 0,
            "document_links_created": 0,
            "document_links_existing": 0,
            "mechanism_links_created": 0,
            "mechanism_links_existing": 0,
            "evidence_links_created": 0,
            "evidence_links_existing": 0,
            "legacy_mappings_deprecated": 0,
            "legacy_controls_deprecated": 0,
            "stale_rule_based_mappings_deprecated": 0,
            "classification": {},
            "warnings": [],
            "errors": [],
        }

        if self.dry_run:
            self.stdout.write(self.style.WARNING("Dry-run ativo: nenhuma alteracao sera gravada."))

        try:
            with transaction.atomic():
                canonical_controls = self._ensure_canonical_controls(stats)
                self._map_external_controls(canonical_controls, stats)
                if self.dry_run:
                    transaction.set_rollback(True)
        except Exception as exc:  # pragma: no cover - production safety reporting
            stats["errors"].append(str(exc))

        self._print_summary(stats)

    def _ensure_canonical_controls(self, stats):
        canonical_controls = {}
        for spec in self.CANONICAL_CONTROLS:
            defaults = {
                "title": spec["title"],
                "description": spec["objective"],
                "control_domain": spec["domain"],
                "objective": spec["objective"],
                "risk_statement": spec["risk"],
                "owner_role": "CISO / Security Governance",
                "criticality": spec["criticality"],
                "status": InternalControl.Status.ACTIVE,
                "source": InternalControl.Source.TEMPLATE,
                "is_active": True,
            }
            internal_control, created = InternalControl.objects.get_or_create(
                code=spec["code"],
                defaults=defaults,
            )
            if created:
                stats["canonical_created"] += 1
            else:
                stats["canonical_existing"] += 1
                updates = {}
                for field, value in defaults.items():
                    if field == "source" and internal_control.source not in {"", InternalControl.Source.TEMPLATE}:
                        continue
                    if getattr(internal_control, field) != value:
                        updates[field] = value
                if updates:
                    for field, value in updates.items():
                        setattr(internal_control, field, value)
                    internal_control.save(update_fields=[*updates.keys(), "updated_at"])
            canonical_controls[spec["code"]] = internal_control
        return canonical_controls

    def _map_external_controls(self, canonical_controls, stats):
        controls = Control.objects.select_related("framework", "section").order_by(
            "framework__code",
            "code",
        )
        for control in controls:
            stats["controls_analyzed"] += 1
            spec = self._classify_control(control)
            canonical = canonical_controls[spec["code"]]
            stats["classification"][canonical.code] = stats["classification"].get(canonical.code, 0) + 1

            mapping, created = InternalControlFrameworkMapping.objects.get_or_create(
                internal_control=canonical,
                framework_control=control,
                defaults={
                    "relationship_type": InternalControlFrameworkMapping.RelationshipType.SUPPORTS,
                    "coverage_percentage": Decimal("100.00"),
                    "rationale": f"{self.RULE_RATIONALE} Categoria: {canonical.code}.",
                    "mapping_source": InternalControlFrameworkMapping.MappingSource.RULE_BASED,
                    "validation_status": self.validation_status,
                    "confidence_score": Decimal("75.00"),
                },
            )
            if created:
                stats["framework_mappings_created"] += 1
            else:
                stats["framework_mappings_existing"] += 1
                if mapping.validation_status in {
                    InternalControlFrameworkMapping.ValidationStatus.REJECTED,
                    InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
                }:
                    if mapping.mapping_source == InternalControlFrameworkMapping.MappingSource.RULE_BASED:
                        mapping.validation_status = self.validation_status
                        mapping.save(update_fields=["validation_status", "updated_at"])
                        stats["framework_mappings_reactivated"] += 1
                    else:
                        stats["warnings"].append(
                            f"Mapping canonico inativo ja existia: {canonical.code} -> "
                            f"{control.framework.code}:{control.code}."
                        )
            if self.deprecate_stale_rule_based:
                stats["stale_rule_based_mappings_deprecated"] += (
                    InternalControlFrameworkMapping.objects.filter(
                        framework_control=control,
                        mapping_source=InternalControlFrameworkMapping.MappingSource.RULE_BASED,
                    )
                    .exclude(internal_control=canonical)
                    .exclude(validation_status=InternalControlFrameworkMapping.ValidationStatus.DEPRECATED)
                    .update(validation_status=InternalControlFrameworkMapping.ValidationStatus.DEPRECATED)
                )

            legacy = self._find_legacy_internal_control(control, canonical)
            if legacy:
                self._copy_policy_links(legacy, canonical, stats)
                self._copy_document_links(legacy, canonical, stats)
                self._copy_mechanism_links(legacy, canonical, stats)
                self._copy_evidence_links(legacy, canonical, stats)
                if self.deprecate_legacy:
                    self._deprecate_legacy_layer(legacy, control, stats)

    def _classify_control(self, control):
        control_code = self._normalized(control.code)
        framework_code = self._normalized(getattr(control.framework, "code", ""))
        section_code = self._normalized(getattr(control.section, "code", "") if control.section else "")
        search_text = self._search_text(control)

        if framework_code in {"iso27002", "iso27001"} and control_code in self.ISO27002_CODE_MAP:
            return self._spec_by_code(self.ISO27002_CODE_MAP[control_code])

        if "physical access" in search_text or "acesso fisico" in search_text:
            return self._spec_by_code("IC-PHY-001")
        if "privileged access" in search_text or "acesso privilegiado" in search_text:
            return self._spec_by_code("IC-AC-002")
        if "access rights" in search_text or "direitos de acesso" in search_text:
            return self._spec_by_code("IC-AC-003")

        if framework_code == "nistcsf":
            prefix_map = [
                ("GV.SC", "IC-SUP-001"),
                ("GV.RM", "IC-RISK-001"),
                ("GV", "IC-GOV-001"),
                ("ID.AM", "IC-ASSET-001"),
                ("ID.RA", "IC-RISK-001"),
                ("PR.AA", "IC-AC-001"),
                ("PR.AC", "IC-AC-001"),
                ("PR.AT", "IC-AWARE-001"),
                ("PR.DS", "IC-DP-001"),
                ("PR.PS", "IC-DEV-001"),
                ("PR.IR", "IC-BCM-001"),
                ("PR.PT", "IC-NET-001"),
                ("DE", "IC-LOG-001"),
                ("RS", "IC-INC-001"),
                ("RC", "IC-BCM-001"),
            ]
            matched = self._match_prefix(control_code, prefix_map)
            if matched:
                return self._spec_by_code(matched)

        if framework_code in {"iso27002", "iso27001"} and section_code.startswith("7"):
            return self._spec_by_code("IC-PHY-001")

        best_spec = None
        best_score = -1
        for spec in self.CANONICAL_CONTROLS:
            score = 0
            for prefix in spec.get("code_prefixes", []):
                if control_code.startswith(self._normalized(prefix)):
                    score += 6
            for prefix in spec.get("section_prefixes", []):
                if section_code.startswith(self._normalized(prefix)):
                    score += 4
            for keyword in spec["keywords"]:
                if self._normalized(keyword) in search_text:
                    score += 3
            if score > best_score:
                best_score = score
                best_spec = spec

        if best_spec and best_score > 0:
            return best_spec
        return self._spec_by_code(self.FALLBACK_CODE)

    def _match_prefix(self, value, prefix_map):
        for prefix, code in prefix_map:
            if value.startswith(self._normalized(prefix)):
                return code
        return None

    def _spec_by_code(self, code):
        return next(spec for spec in self.CANONICAL_CONTROLS if spec["code"] == code)

    def _search_text(self, control):
        section = control.section
        parts = [
            getattr(control.framework, "code", ""),
            getattr(control.framework, "name", ""),
            control.code,
            control.title,
            control.description,
            control.implementation_guidance,
            getattr(section, "code", "") if section else "",
            getattr(section, "name", "") if section else "",
        ]
        return self._normalized(" ".join(str(part or "") for part in parts))

    def _normalized(self, value):
        return str(value or "").strip().lower()

    def _find_legacy_internal_control(self, control, canonical):
        return (
            InternalControl.objects.filter(legacy_control=control)
            .exclude(pk=canonical.pk)
            .order_by("created_at")
            .first()
        )

    def _copy_policy_links(self, legacy, canonical, stats):
        links = PolicyInternalControl.objects.filter(internal_control=legacy).select_related("policy")
        for link in links:
            _created_link, created = PolicyInternalControl.objects.get_or_create(
                policy=link.policy,
                internal_control=canonical,
                defaults={
                    "applicability": link.applicability,
                    "rationale": self._copied_rationale(link.rationale, legacy),
                    "mapping_source": PolicyInternalControl.MappingSource.RULE_BASED,
                    "validation_status": self._status_for_copied_link(link.validation_status),
                    "confidence_score": link.confidence_score or Decimal("75.00"),
                    "created_by": link.created_by,
                    "updated_by": link.updated_by,
                    "validated_by": link.validated_by if self.approve else None,
                    "validated_at": link.validated_at if self.approve else None,
                },
            )
            self._increment_created_existing(stats, "policy_links", created)

    def _copy_document_links(self, legacy, canonical, stats):
        links = GovernanceDocumentControl.objects.filter(internal_control=legacy).select_related("document")
        for link in links:
            _created_link, created = GovernanceDocumentControl.objects.get_or_create(
                document=link.document,
                internal_control=canonical,
                purpose=link.purpose,
                defaults={
                    "rationale": self._copied_rationale(link.rationale, legacy),
                    "mapping_source": GovernanceDocumentControl.MappingSource.RULE_BASED,
                    "validation_status": self._status_for_copied_link(link.validation_status),
                    "confidence_score": link.confidence_score or Decimal("75.00"),
                    "created_by": link.created_by,
                    "updated_by": link.updated_by,
                    "validated_by": link.validated_by if self.approve else None,
                    "validated_at": link.validated_at if self.approve else None,
                },
            )
            self._increment_created_existing(stats, "document_links", created)

    def _copy_mechanism_links(self, legacy, canonical, stats):
        links = InternalControlMechanism.objects.filter(internal_control=legacy).select_related("mechanism")
        for link in links:
            _created_link, created = InternalControlMechanism.objects.get_or_create(
                internal_control=canonical,
                mechanism=link.mechanism,
                defaults={
                    "contribution_weight": link.contribution_weight,
                    "mandatory": link.mandatory,
                    "implementation_status": link.implementation_status,
                    "relationship_type": link.relationship_type,
                    "rationale": self._copied_rationale(link.rationale, legacy),
                    "mapping_source": InternalControlMechanism.MappingSource.RULE_BASED,
                    "validation_status": self._status_for_copied_link(link.validation_status),
                    "confidence_score": link.confidence_score or Decimal("75.00"),
                    "created_by": link.created_by,
                    "updated_by": link.updated_by,
                    "validated_by": link.validated_by if self.approve else None,
                    "validated_at": link.validated_at if self.approve else None,
                },
            )
            self._increment_created_existing(stats, "mechanism_links", created)

    def _copy_evidence_links(self, legacy, canonical, stats):
        links = EvidenceLink.objects.filter(
            target_type=EvidenceLink.TargetType.INTERNAL_CONTROL,
            target_id=legacy.id,
        ).select_related("evidence_item")
        for link in links:
            _created_link, created = EvidenceLink.objects.get_or_create(
                evidence_item=link.evidence_item,
                target_type=EvidenceLink.TargetType.INTERNAL_CONTROL,
                target_id=canonical.id,
                link_type=link.link_type,
                defaults={
                    "rationale": self._copied_rationale(link.rationale, legacy),
                    "mapping_source": EvidenceLink.MappingSource.RULE_BASED,
                    "validation_status": self._status_for_copied_link(link.validation_status),
                    "confidence_score": link.confidence_score or Decimal("75.00"),
                    "created_by": link.created_by,
                    "updated_by": link.updated_by,
                    "validated_by": link.validated_by if self.approve else None,
                    "validated_at": link.validated_at if self.approve else None,
                },
            )
            self._increment_created_existing(stats, "evidence_links", created)

    def _status_for_copied_link(self, original_status):
        if original_status in {
            InternalControlFrameworkMapping.ValidationStatus.REJECTED,
            InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
        }:
            return original_status
        if self.approve:
            return InternalControlFrameworkMapping.ValidationStatus.APPROVED
        return InternalControlFrameworkMapping.ValidationStatus.PENDING_REVIEW

    def _copied_rationale(self, original_rationale, legacy):
        parts = [self.LINK_RATIONALE.format(legacy_code=legacy.code)]
        if original_rationale:
            parts.append(str(original_rationale))
        return "\n".join(parts)

    def _increment_created_existing(self, stats, key, created):
        if created:
            stats[f"{key}_created"] += 1
        else:
            stats[f"{key}_existing"] += 1

    def _deprecate_legacy_layer(self, legacy, control, stats):
        updated_mappings = InternalControlFrameworkMapping.objects.filter(
            internal_control=legacy,
            framework_control=control,
            mapping_source=InternalControlFrameworkMapping.MappingSource.MIGRATED,
        ).exclude(
            validation_status=InternalControlFrameworkMapping.ValidationStatus.DEPRECATED
        ).update(validation_status=InternalControlFrameworkMapping.ValidationStatus.DEPRECATED)
        stats["legacy_mappings_deprecated"] += updated_mappings

        if legacy.source == InternalControl.Source.MIGRATED and (
            legacy.is_active or legacy.status != InternalControl.Status.DEPRECATED
        ):
            legacy.status = InternalControl.Status.DEPRECATED
            legacy.is_active = False
            legacy.save(update_fields=["status", "is_active", "updated_at"])
            stats["legacy_controls_deprecated"] += 1

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Normalizacao do catalogo interno concluida."))
        self.stdout.write(f"Controlos canonicos criados: {stats['canonical_created']}")
        self.stdout.write(f"Controlos canonicos existentes: {stats['canonical_existing']}")
        self.stdout.write(f"Controlos externos analisados: {stats['controls_analyzed']}")
        self.stdout.write(f"Mappings canonicos criados: {stats['framework_mappings_created']}")
        self.stdout.write(f"Mappings canonicos existentes: {stats['framework_mappings_existing']}")
        self.stdout.write(f"Mappings canonicos reativados: {stats['framework_mappings_reactivated']}")
        self.stdout.write(f"PolicyInternalControl canonicos criados: {stats['policy_links_created']}")
        self.stdout.write(f"PolicyInternalControl canonicos existentes: {stats['policy_links_existing']}")
        self.stdout.write(f"GovernanceDocumentControl canonicos criados: {stats['document_links_created']}")
        self.stdout.write(f"GovernanceDocumentControl canonicos existentes: {stats['document_links_existing']}")
        self.stdout.write(f"InternalControlMechanism canonicos criados: {stats['mechanism_links_created']}")
        self.stdout.write(f"InternalControlMechanism canonicos existentes: {stats['mechanism_links_existing']}")
        self.stdout.write(f"EvidenceLink canonicos criados: {stats['evidence_links_created']}")
        self.stdout.write(f"EvidenceLink canonicos existentes: {stats['evidence_links_existing']}")
        self.stdout.write(f"Mappings 1:1 deprecated: {stats['legacy_mappings_deprecated']}")
        self.stdout.write(f"InternalControls 1:1 ocultados: {stats['legacy_controls_deprecated']}")
        self.stdout.write(
            f"Mappings rule-based obsoletos deprecated: {stats['stale_rule_based_mappings_deprecated']}"
        )

        if stats["classification"]:
            self.stdout.write("Distribuicao por controlo canonico:")
            for code, count in sorted(stats["classification"].items()):
                self.stdout.write(f"- {code}: {count}")

        if self.approve:
            self.stdout.write("Modo de validacao: approved.")
        else:
            self.stdout.write("Modo de validacao: pending_review.")

        if stats["warnings"]:
            self.stdout.write(self.style.WARNING("Warnings:"))
            for warning in stats["warnings"]:
                self.stdout.write(f"- {warning}")
        else:
            self.stdout.write("Warnings: 0")

        if stats["errors"]:
            self.stdout.write(self.style.ERROR("Erros:"))
            for error in stats["errors"]:
                self.stdout.write(f"- {error}")
        else:
            self.stdout.write("Erros: 0")
