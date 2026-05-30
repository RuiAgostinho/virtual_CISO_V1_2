import os
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import (
    Control,
    Framework,
    FrameworkLevel,
    FrameworkSection,
    InternalControl,
    InternalControlFrameworkMapping,
)


class Command(BaseCommand):
    help = "Cria uma camada de obrigações operacionais DL 125/2025/NIS2 mapeadas para controlos internos."

    OBLIGATIONS = [
        {
            "code": "DL125-ORG-001",
            "section": "Organizacao",
            "title": "Enquadramento da entidade e racional de classificação",
            "description": "Registar setor, subsetor, dimensão, volume de negócios e racional de enquadramento como entidade essencial, importante ou não abrangida.",
            "internal_control": "IC-GOV-001",
        },
        {
            "code": "DL125-ORG-002",
            "section": "Organizacao",
            "title": "Responsável de cibersegurança e ponto de contacto permanente",
            "description": "Designar responsáveis, contactos permanentes e processo de contacto/notificação operacional.",
            "internal_control": "IC-GOV-001",
        },
        {
            "code": "DL125-GOV-001",
            "section": "Governo e risco",
            "title": "Políticas de segurança e gestão de risco",
            "description": "Estabelecer políticas, responsabilidades e medidas de gestão de riscos de cibersegurança.",
            "internal_control": "IC-RISK-001",
        },
        {
            "code": "DL125-ASSET-001",
            "section": "Ativos e serviços",
            "title": "Inventário de ativos, serviços críticos e dependências",
            "description": "Manter inventário de ativos, serviços essenciais ou digitais, dependências, fornecedores e proprietários.",
            "internal_control": "IC-ASSET-001",
        },
        {
            "code": "DL125-INC-001",
            "section": "Incidentes",
            "title": "Gestão, comunicação e notificação de incidentes",
            "description": "Definir processos de deteção, triagem, resposta, escalamento, reporte e notificação de incidentes relevantes.",
            "internal_control": "IC-INC-001",
        },
        {
            "code": "DL125-BCM-001",
            "section": "Continuidade",
            "title": "Continuidade de negócio, backup e recuperação",
            "description": "Assegurar continuidade, backups, gestão de crises, recuperação e testes de restauro para serviços críticos.",
            "internal_control": "IC-BCM-001",
        },
        {
            "code": "DL125-SUP-001",
            "section": "Fornecedores",
            "title": "Gestão de risco da cadeia de abastecimento",
            "description": "Avaliar fornecedores críticos, dependências, cláusulas contratuais, monitorização e riscos de terceiros.",
            "internal_control": "IC-SUP-001",
        },
        {
            "code": "DL125-DEV-001",
            "section": "Desenvolvimento e operação",
            "title": "Segurança na aquisição, desenvolvimento e manutenção",
            "description": "Integrar segurança na aquisição, desenvolvimento, manutenção, configuração, alterações e gestão de vulnerabilidades.",
            "internal_control": "IC-DEV-001",
        },
        {
            "code": "DL125-VUL-001",
            "section": "Vulnerabilidades",
            "title": "Gestão de vulnerabilidades, correção e divulgação coordenada",
            "description": "Identificar, avaliar, priorizar, corrigir e acompanhar vulnerabilidades técnicas e processos de divulgação.",
            "internal_control": "IC-VUL-001",
        },
        {
            "code": "DL125-EVID-001",
            "section": "Evidência e melhoria",
            "title": "Avaliação da eficácia e melhoria contínua",
            "description": "Avaliar a eficácia das medidas, manter evidências, registar gaps e demonstrar melhoria contínua.",
            "internal_control": "IC-EVID-001",
        },
        {
            "code": "DL125-AWARE-001",
            "section": "Pessoas",
            "title": "Ciber-higiene, sensibilização e formação",
            "description": "Garantir práticas básicas de ciber-higiene, formação, sensibilização e responsabilidades de pessoas.",
            "internal_control": "IC-AWARE-001",
        },
        {
            "code": "DL125-DP-001",
            "section": "Proteção de dados",
            "title": "Criptografia, proteção de dados e comunicações seguras",
            "description": "Aplicar políticas e mecanismos de criptografia, proteção de informação e comunicações seguras.",
            "internal_control": "IC-DP-001",
        },
        {
            "code": "DL125-AC-001",
            "section": "Acessos",
            "title": "Controlo de acessos e autenticação multifator",
            "description": "Aplicar controlo de acessos, gestão de identidades, autenticação multifator e privilégios mínimos.",
            "internal_control": "IC-AC-001",
        },
        {
            "code": "DL125-LOG-001",
            "section": "Monitorização",
            "title": "Logging, monitorização e deteção operacional",
            "description": "Recolher eventos, monitorizar atividades e detetar sinais de compromisso ou incidentes.",
            "internal_control": "IC-LOG-001",
        },
    ]
    RATIONALE = (
        "Obrigação operacional DL 125/2025/NIS2 mapeada para controlo interno canónico. "
        "A classificação legal e a aplicabilidade final continuam sujeitas a validação humana."
    )

    def add_arguments(self, parser):
        parser.add_argument("--framework-version", default="2025")
        parser.add_argument(
            "--pending-review",
            action="store_true",
            help="Cria os mappings como pending_review em vez de approved.",
        )
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        os.environ.setdefault("VIRTUAL_CISO_DISABLE_RAG_SIGNALS", "1")
        stats = {
            "framework_created": 0,
            "levels_created": 0,
            "sections_created": 0,
            "sections_updated": 0,
            "controls_created": 0,
            "controls_updated": 0,
            "mappings_created": 0,
            "mappings_existing": 0,
            "missing_internal_controls": [],
        }
        validation_status = (
            InternalControlFrameworkMapping.ValidationStatus.PENDING_REVIEW
            if options["pending_review"]
            else InternalControlFrameworkMapping.ValidationStatus.APPROVED
        )

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry-run ativo: nenhuma alteracao sera gravada."))

        with transaction.atomic():
            framework, created = Framework.objects.update_or_create(
                code=Framework.FrameworkCode.DL125,
                version=options["framework_version"],
                defaults={
                    "name": "Decreto-Lei n.º 125/2025",
                    "publisher": "Diário da República / Estado Português",
                    "description": "Transposição nacional da Diretiva NIS2, modelada como obrigações operacionais.",
                    "is_active": True,
                },
            )
            stats["framework_created"] = int(created)
            level = self._ensure_level(framework, stats)
            sections = self._ensure_sections(framework, level, stats)

            for order, item in enumerate(self.OBLIGATIONS, start=1):
                control, control_created = Control.objects.update_or_create(
                    framework=framework,
                    code=item["code"],
                    defaults={
                        "section": sections[item["section"]],
                        "title": item["title"],
                        "description": item["description"],
                        "implementation_guidance": "",
                        "is_mandatory": True,
                        "applicability_scope": "legal",
                        "status": Control.Status.ACTIVE,
                    },
                )
                control.section.sort_order = min(control.section.sort_order, order)
                stats["controls_created" if control_created else "controls_updated"] += 1

                internal_control = InternalControl.objects.filter(
                    code=item["internal_control"],
                    is_active=True,
                ).first()
                if not internal_control:
                    stats["missing_internal_controls"].append(item["internal_control"])
                    continue
                _mapping, mapping_created = InternalControlFrameworkMapping.objects.get_or_create(
                    internal_control=internal_control,
                    framework_control=control,
                    defaults={
                        "relationship_type": InternalControlFrameworkMapping.RelationshipType.SUPPORTS,
                        "coverage_percentage": Decimal("100.00"),
                        "rationale": self.RATIONALE,
                        "mapping_source": InternalControlFrameworkMapping.MappingSource.TEMPLATE,
                        "validation_status": validation_status,
                        "confidence_score": Decimal("90.00"),
                    },
                )
                stats["mappings_created" if mapping_created else "mappings_existing"] += 1

            if options["dry_run"]:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS("Obrigacoes DL 125/2025 sincronizadas."))
        for key, value in stats.items():
            self.stdout.write(f"{key}: {value}")
        self.stdout.write(f"validation_status: {validation_status}")

    def _ensure_level(self, framework, stats):
        level, created = FrameworkLevel.objects.get_or_create(
            framework=framework,
            level=1,
            defaults={"name": "Obligation domain", "description": "Domínio de obrigação legal operacional."},
        )
        if created:
            stats["levels_created"] += 1
        return level

    def _ensure_sections(self, framework, level, stats):
        sections = {}
        for order, name in enumerate(dict.fromkeys(item["section"] for item in self.OBLIGATIONS), start=1):
            code = self._section_code(name)
            section, created = FrameworkSection.objects.update_or_create(
                framework=framework,
                code=code,
                defaults={
                    "name": name,
                    "parent": None,
                    "level": 1,
                    "level_ref": level,
                    "sort_order": order,
                },
            )
            stats["sections_created" if created else "sections_updated"] += 1
            sections[name] = section
        return sections

    def _section_code(self, name):
        return (
            "DL125-"
            + name.upper()
            .replace("Ç", "C")
            .replace("Ã", "A")
            .replace("Á", "A")
            .replace("Ê", "E")
            .replace("É", "E")
            .replace("Í", "I")
            .replace("Õ", "O")
            .replace("Ó", "O")
            .replace(" ", "-")
            .replace("/", "-")
        )
