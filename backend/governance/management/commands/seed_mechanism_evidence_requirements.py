import unicodedata

from django.core.management.base import BaseCommand
from django.utils import timezone

from governance.models import EvidenceItem, EvidenceLink, Mechanism, MechanismEvidenceRequirement


class Command(BaseCommand):
    help = "Cria catalogo reutilizavel de evidencias esperadas por tipo de mecanismo."

    DEFAULT_REQUIREMENTS = [
        {
            "title": "Registo de implementacao do mecanismo",
            "description": "Registo minimo que demonstra que o mecanismo foi implementado ou configurado.",
            "evidence_type": EvidenceItem.EvidenceType.MANUAL_ATTESTATION,
            "keywords": [],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Fallback para mecanismos sem template especifico.",
        },
        {
            "title": "Procedimento ou instrucao operacional aprovada",
            "description": "Documento operacional aprovado que descreve como o mecanismo e executado.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "keywords": [],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Ajuda a provar governance e operacionalizacao do mecanismo.",
        },
        {
            "title": "Exportacao da configuracao de MFA ou autenticacao forte",
            "description": "Export, screenshot ou politica de autenticacao que demonstre MFA/strong authentication ativo.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "keywords": ["mfa", "autenticacao", "authentication", "identity", "identidade", "iam", "acesso"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova que o mecanismo tecnico de autenticacao esta configurado.",
        },
        {
            "title": "Relatorio de revisao de acessos e privilegios",
            "description": "Relatorio assinado ou aprovado com a revisao periodica de acessos.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "keywords": ["acesso", "access", "privileg", "rbac", "pam", "iam", "review"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Demonstra validacao humana das permissoes e dos privilegios.",
        },
        {
            "title": "Ticket de alteracao ou remocao de privilegios",
            "description": "Ticket fechado que demonstre execucao controlada de alteracoes de acesso.",
            "evidence_type": EvidenceItem.EvidenceType.TICKET,
            "keywords": ["acesso", "access", "privileg", "offboarding", "joiner", "mover", "leaver"],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Liga o mecanismo de acessos a execucao operacional rastreavel.",
        },
        {
            "title": "Relatorio de scan de vulnerabilidades",
            "description": "Relatorio tecnico do scanner com data, ambito e resultados.",
            "evidence_type": EvidenceItem.EvidenceType.VULNERABILITY_SCAN,
            "keywords": ["vulnerab", "scan", "patch", "correcao", "remediation", "exposure"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova identificacao recorrente de vulnerabilidades.",
        },
        {
            "title": "Tickets de remediacao fechados por severidade",
            "description": "Amostra de tickets fechados que demonstre tratamento de vulnerabilidades.",
            "evidence_type": EvidenceItem.EvidenceType.TICKET,
            "keywords": ["vulnerab", "patch", "correcao", "remediation", "sla"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Liga descoberta tecnica a remediacao e SLA.",
        },
        {
            "title": "Configuracao de retencao e centralizacao de logs",
            "description": "Exportacao ou screenshot que demonstre fontes de logs e politica de retencao.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "keywords": ["log", "logging", "monitor", "siem", "alert", "deteccao", "detection"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova rastreabilidade e monitorizacao operacional.",
        },
        {
            "title": "Exemplo de alerta SIEM analisado",
            "description": "Alerta ou caso analisado com triagem, decisao e resultado.",
            "evidence_type": EvidenceItem.EvidenceType.SIEM_ALERT,
            "keywords": ["siem", "alert", "deteccao", "detection", "monitor"],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Mostra que a monitorizacao produz resposta operacional.",
        },
        {
            "title": "Logs de execucao de backups",
            "description": "Logs ou relatorio de execucao que demonstre periodicidade e sucesso dos backups.",
            "evidence_type": EvidenceItem.EvidenceType.LOG,
            "keywords": ["backup", "restore", "restauro", "recuperacao", "recovery", "continuidade"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova que o mecanismo de backup executa conforme definido.",
        },
        {
            "title": "Relatorio de teste de restauro",
            "description": "Relatorio com resultado de teste de recuperacao/restauro.",
            "evidence_type": EvidenceItem.EvidenceType.REPORT,
            "keywords": ["backup", "restore", "restauro", "recuperacao", "recovery", "continuidade"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Valida recuperabilidade, nao apenas existencia de backups.",
        },
        {
            "title": "Registo de incidente ou exercicio de simulacao",
            "description": "Registo de incidente, exercicio ou playbook executado com resultado e licoes aprendidas.",
            "evidence_type": EvidenceItem.EvidenceType.REPORT,
            "keywords": ["incident", "incidente", "playbook", "resposta", "response"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Demonstra capacidade de resposta a incidentes.",
        },
        {
            "title": "Ata de revisao pos-incidente",
            "description": "Ata ou decisao com a revisao pos-incidente e plano de melhoria.",
            "evidence_type": EvidenceItem.EvidenceType.MEETING_MINUTES,
            "keywords": ["incident", "incidente", "post", "resposta", "lessons"],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Evidencia melhoria continua apos incidente ou exercicio.",
        },
        {
            "title": "Questionario ou avaliacao de seguranca de fornecedor",
            "description": "Questionario, avaliacao ou due diligence de seguranca do fornecedor.",
            "evidence_type": EvidenceItem.EvidenceType.AUDIT_REPORT,
            "keywords": ["supplier", "fornecedor", "third", "terceir", "vendor", "contrat"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Demonstra avaliacao de risco de terceiros.",
        },
        {
            "title": "Contrato ou anexo com clausulas de seguranca",
            "description": "Contrato, adenda ou anexo com requisitos de seguranca e notificacao.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "keywords": ["supplier", "fornecedor", "contract", "contrat", "third", "vendor"],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Formaliza responsabilidades de seguranca do fornecedor.",
        },
        {
            "title": "Exportacao do inventario com owner e criticidade",
            "description": "Exportacao do inventario de ativos com owner, criticidade e data de atualizacao.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "keywords": ["asset", "ativo", "invent", "cmdb", "classificacao", "classification"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova cobertura e ownership dos ativos.",
        },
        {
            "title": "Evidencia de classificacao de ativos ou informacao",
            "description": "Registo, exportacao ou aprovacao que demonstre classificacao aplicada.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "keywords": ["asset", "ativo", "classificacao", "classification", "informacao"],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Liga protecao ao valor e criticidade da informacao.",
        },
        {
            "title": "Exportacao de configuracao de cifragem",
            "description": "Exportacao ou screenshot que demonstre cifragem ativa em repouso ou em transito.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "keywords": ["encryption", "cifr", "encrypt", "tls", "key", "chave"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova configuracao tecnica de cifragem.",
        },
        {
            "title": "Exportacao de regras de firewall, WAF ou segmentacao",
            "description": "Exportacao de regras, zonas ou politicas de segmentacao/rede.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "keywords": ["firewall", "waf", "segment", "network", "rede", "segregacao"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Demonstra aplicacao tecnica de controlos de rede.",
        },
        {
            "title": "Relatorio de cobertura EDR/XDR ou antimalware",
            "description": "Relatorio de cobertura dos endpoints protegidos e estado dos agentes.",
            "evidence_type": EvidenceItem.EvidenceType.REPORT,
            "keywords": ["edr", "xdr", "antimalware", "endpoint", "malware"],
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova cobertura do mecanismo de protecao endpoint.",
        },
        {
            "title": "Configuracao ou screenshot do sistema de videovigilancia",
            "description": "Configuracao, screenshot ou registo que demonstre cameras, retencao e acesso controlado.",
            "evidence_type": EvidenceItem.EvidenceType.SCREENSHOT,
            "keywords": ["cctv", "video", "videovigilancia", "physical", "fisica", "instalacoes"],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Demonstra implementacao do mecanismo fisico de vigilancia.",
        },
        {
            "title": "Registo de formacao ou sensibilizacao",
            "description": "Relatorio ou lista de participacao em formacao de seguranca.",
            "evidence_type": EvidenceItem.EvidenceType.REPORT,
            "keywords": ["training", "formacao", "awareness", "sensibilizacao", "pessoas"],
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Comprova execucao de mecanismos de consciencializacao.",
        },
    ]

    SMART_REQUIREMENT_PROFILES = [
        {
            "keywords": ["nda", "nao divulgacao", "confidencialidade", "confidentiality"],
            "title": "NDA assinado ou registo de aceitacao",
            "description": "Copia do acordo assinado, registo de aceitacao ou evidencia equivalente que demonstre compromisso formal de confidencialidade.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "O mecanismo depende de aceitacao formal e rastreavel por parte dos envolvidos.",
        },
        {
            "keywords": ["responsabilidade", "accountable", "raci", "segregacao", "funcoes"],
            "title": "Matriz de responsabilidades aprovada",
            "description": "Matriz RACI, despacho ou registo aprovado que identifique owner, accountable e responsabilidades operacionais do mecanismo.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova ownership e accountability do mecanismo.",
        },
        {
            "keywords": ["autoavaliacao", "conformidade", "compliance", "maturidade", "tier", "csf", "perfil"],
            "title": "Relatorio de avaliacao de conformidade aprovado",
            "description": "Relatorio de autoavaliacao, maturidade ou perfil de conformidade com resultados, data, responsavel e aprovacao.",
            "evidence_type": EvidenceItem.EvidenceType.AUDIT_REPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Demonstra avaliacao formal do estado de conformidade ou maturidade.",
        },
        {
            "keywords": ["background", "antecedentes"],
            "title": "Registo de verificacao de antecedentes concluida",
            "description": "Registo autorizado da verificacao de antecedentes, com data, ambito e resultado de elegibilidade.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova execucao controlada do mecanismo de screening.",
        },
        {
            "keywords": ["formacao", "awareness", "sensibilizacao", "acolhimento", "onboarding"],
            "title": "Registo de participacao em formacao de seguranca",
            "description": "Relatorio de formacao, lista de presencas ou registo LMS com participantes, data, conteudo e resultado.",
            "evidence_type": EvidenceItem.EvidenceType.REPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova execucao e cobertura do mecanismo de sensibilizacao.",
        },
        {
            "keywords": ["eficacia", "tecnologia", "tecnologias", "protecao", "protecao"],
            "title": "Relatorio de teste de eficacia do mecanismo tecnico",
            "description": "Relatorio, teste ou registo de validacao que demonstre eficacia, cobertura, resultado e excecoes do mecanismo tecnico.",
            "evidence_type": EvidenceItem.EvidenceType.REPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova que o mecanismo tecnico foi avaliado e que produz o resultado esperado.",
        },
        {
            "keywords": ["incidente", "incident", "comunicacao", "recuperacao", "playbook", "exercicio"],
            "title": "Registo de incidente, exercicio ou comunicacao executada",
            "description": "Registo de incidente, exercicio, comunicacao ou playbook executado com data, participantes, resultado e licoes aprendidas.",
            "evidence_type": EvidenceItem.EvidenceType.REPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Demonstra que o mecanismo de resposta ou recuperacao foi testado ou executado.",
        },
        {
            "keywords": ["risco", "risk", "bia", "impacto", "continuidade", "resiliencia", "capacidade"],
            "title": "Relatorio de avaliacao ou tratamento de risco aprovado",
            "description": "Relatorio, BIA ou plano de tratamento com criterios, resultado, owner, prioridade e aprovacao.",
            "evidence_type": EvidenceItem.EvidenceType.REPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Demonstra que o mecanismo produz uma decisao de risco rastreavel.",
        },
        {
            "keywords": ["backup", "restauro", "restore", "recuperacao"],
            "title": "Logs de execucao e teste de restauro",
            "description": "Logs de backup e evidencia de teste de restauro com data, resultado, sistemas abrangidos e excecoes.",
            "evidence_type": EvidenceItem.EvidenceType.LOG,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova execucao e recuperabilidade, nao apenas configuracao.",
        },
        {
            "keywords": ["catalogo", "interligacoes", "sistemas externos", "inventario", "ativo", "ativos", "cmdb"],
            "title": "Exportacao do catalogo ou inventario atualizado",
            "description": "Exportacao do catalogo, inventario ou CMDB com owner, criticidade, interligacoes relevantes e data de atualizacao.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova que o mecanismo mantem uma fonte atualizada e controlada.",
        },
        {
            "keywords": ["log", "logging", "monitor", "monitorizacao", "siem", "alerta", "detec", "evento"],
            "title": "Configuracao de retencao e centralizacao de logs",
            "description": "Exportacao, screenshot ou configuracao que demonstre fontes de logs, retencao, alertas e ownership operacional.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova rastreabilidade e monitorizacao operacional.",
        },
        {
            "keywords": ["mfa", "autenticacao", "authentication", "identidade", "iam", "acesso", "privilegio", "pam"],
            "title": "Exportacao de configuracao de acesso e autenticacao",
            "description": "Exportacao ou screenshot de MFA, RBAC, PAM, politica de autenticacao ou revisao de acessos aplicavel.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova aplicacao tecnica ou operacional do mecanismo de acessos.",
        },
        {
            "keywords": ["web", "dns", "filtragem", "firewall", "waf", "rede", "segmentacao", "portal seguro", "transferencia"],
            "title": "Exportacao de configuracao tecnica de protecao",
            "description": "Exportacao, screenshot ou politica ativa que demonstre regras, bloqueios, excecoes, retencao e responsavel tecnico.",
            "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Comprova configuracao efetiva do mecanismo tecnico.",
        },
        {
            "keywords": ["software", "aprovacao", "alteracao", "alteracoes", "workflow", "change", "ticket"],
            "title": "Ticket ou registo de aprovacao operacional",
            "description": "Ticket fechado, aprovacao ou registo de alteracao com pedido, avaliacao, decisao, executante e data.",
            "evidence_type": EvidenceItem.EvidenceType.TICKET,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Liga o mecanismo a uma execucao operacional rastreavel.",
        },
        {
            "keywords": ["fornecedor", "supplier", "vendor", "cadeia", "logistica", "third", "terceir", "contrato"],
            "title": "Avaliacao ou clausulas de seguranca de fornecedor",
            "description": "Questionario, avaliacao, contrato ou anexo com requisitos de seguranca, responsaveis, prazos e evidencias exigidas.",
            "evidence_type": EvidenceItem.EvidenceType.AUDIT_REPORT,
            "priority": MechanismEvidenceRequirement.Priority.HIGH,
            "rationale": "Demonstra avaliacao e formalizacao de requisitos de terceiros.",
        },
        {
            "keywords": ["politica", "procedimento", "instrucao", "processo disciplinar", "runbook", "operacional"],
            "title": "Documento aprovado e publicado",
            "description": "Politica, procedimento, instrucao ou regulamento aprovado, publicado e com owner definido.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Comprova existencia formal do mecanismo documental.",
        },
        {
            "keywords": ["grupos", "confianca", "setorial", "setoriais", "partilha"],
            "title": "Registo de participacao e partilha setorial",
            "description": "Ata, email, registo de participacao ou evidencia de partilha de informacao com grupos de confianca ou entidades setoriais.",
            "evidence_type": EvidenceItem.EvidenceType.MEETING_MINUTES,
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Comprova participacao ativa em canais externos de cooperacao e confianca.",
        },
        {
            "keywords": ["autoridades", "contactos", "partes interessadas", "expectativas", "contexto", "servicos criticos", "oportunidades"],
            "title": "Registo de contexto e contactos aprovado",
            "description": "Mapa, matriz ou registo aprovado com partes interessadas, contactos, servicos criticos, expectativas ou oportunidades relevantes.",
            "evidence_type": EvidenceItem.EvidenceType.APPROVAL_RECORD,
            "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
            "rationale": "Comprova que o mecanismo organizacional esta documentado e validado.",
        },
    ]

    GENERIC_PROFILE = {
        "title": "Registo de execucao e validacao operacional",
        "description": "Registo, relatorio, screenshot ou evidencia equivalente que demonstre que o mecanismo foi executado, configurado ou revisto por um responsavel.",
        "evidence_type": EvidenceItem.EvidenceType.MANUAL_ATTESTATION,
        "priority": MechanismEvidenceRequirement.Priority.MEDIUM,
        "rationale": "Fallback controlado para mecanismos sem perfil especifico no catalogo.",
    }

    def add_arguments(self, parser):
        parser.add_argument(
            "--materialize-for-mechanisms",
            action="store_true",
            help="Cria requisitos especificos por Mechanism a partir dos templates recomendados.",
        )
        parser.add_argument(
            "--max-per-mechanism",
            type=int,
            default=4,
            help="Numero maximo de tipos de evidencia a criar por mecanismo.",
        )
        parser.add_argument(
            "--replace-specific",
            action="store_true",
            help="Desativa requisitos especificos antigos gerados automaticamente e deixa apenas o perfil recomendado.",
        )
        parser.add_argument(
            "--refresh-required-by-links",
            action="store_true",
            help="Atualiza EvidenceItems ja ligados como required_by a mecanismos com o novo perfil recomendado.",
        )

    @staticmethod
    def normalize(value):
        return unicodedata.normalize("NFD", str(value or "")).encode("ascii", "ignore").decode("ascii").lower()

    @staticmethod
    def truncate(value, max_length=255):
        value = str(value or "").strip()
        if len(value) <= max_length:
            return value
        return f"{value[: max_length - 3].rstrip()}..."

    def keyword_matches(self, text, keyword):
        normalized_keyword = self.normalize(keyword)
        if not normalized_keyword:
            return False
        if " " in normalized_keyword:
            return normalized_keyword in text
        tokens = [token for token in text.replace("-", " ").replace("/", " ").split() if token]
        return any(token == normalized_keyword or token.startswith(normalized_keyword) for token in tokens)

    def profile_for_mechanism(self, mechanism):
        title_text = self.normalize(mechanism.title or "")
        text = self.normalize(" ".join([mechanism.title or "", mechanism.description or "", mechanism.mechanism_type or ""]))
        best_profile = None
        best_score = 0
        for profile in self.SMART_REQUIREMENT_PROFILES:
            score = 0
            for keyword in profile["keywords"]:
                if self.keyword_matches(title_text, keyword):
                    score += 10
                elif self.keyword_matches(text, keyword):
                    score += 1
            if score > best_score:
                best_profile = profile
                best_score = score
        return best_profile or self.GENERIC_PROFILE

    def specific_requirement_payload(self, mechanism):
        profile = self.profile_for_mechanism(mechanism)
        title = str(profile["title"]).strip()
        mechanism_title = str(mechanism.title or "").strip()
        if mechanism_title and self.normalize(mechanism_title) not in self.normalize(title):
            title = f"{title} - {mechanism_title}"
        return {
            "title": self.truncate(title),
            "description": profile["description"],
            "evidence_type": profile["evidence_type"],
            "priority": profile["priority"],
            "rationale": profile["rationale"],
            "keywords": profile.get("keywords", []),
        }

    def requirement_rank(self, requirement, mechanism):
        priority_rank = {
            MechanismEvidenceRequirement.Priority.CRITICAL: 0,
            MechanismEvidenceRequirement.Priority.HIGH: 1,
            MechanismEvidenceRequirement.Priority.MEDIUM: 2,
            MechanismEvidenceRequirement.Priority.LOW: 3,
        }
        text = " ".join(
            [
                mechanism.title or "",
                mechanism.description or "",
                mechanism.mechanism_type or "",
            ]
        ).lower()
        keyword_hits = sum(1 for keyword in requirement.keywords if str(keyword).lower() in text)
        is_generic = 1 if not requirement.keywords else 0
        return (is_generic, -keyword_hits, priority_rank.get(requirement.priority, 9), requirement.title)

    def materialize_for_mechanisms(self, max_per_mechanism, replace_specific=False):
        stats = {
            "mechanisms": 0,
            "created": 0,
            "updated": 0,
            "deactivated": 0,
            "without_templates": 0,
            "errors": [],
        }
        templates = list(MechanismEvidenceRequirement.objects.filter(mechanism__isnull=True, is_active=True))

        for mechanism in Mechanism.objects.all().order_by("title"):
            stats["mechanisms"] += 1
            smart_payload = self.specific_requirement_payload(mechanism)
            matching_templates = [
                template
                for template in templates
                if template.matches_mechanism(mechanism, "")
            ]
            matching_templates.sort(key=lambda template: self.requirement_rank(template, mechanism))
            selected_payloads = [smart_payload]
            for template in matching_templates:
                if len(selected_payloads) >= max(1, max_per_mechanism):
                    break
                template_payload = {
                    "title": self.truncate(f"{template.title} - {mechanism.title}"),
                    "description": template.description,
                    "evidence_type": template.evidence_type,
                    "priority": template.priority,
                    "rationale": template.rationale,
                    "keywords": template.keywords,
                }
                if self.normalize(template_payload["title"]) not in {
                    self.normalize(payload["title"]) for payload in selected_payloads
                }:
                    selected_payloads.append(template_payload)

            if not selected_payloads:
                stats["without_templates"] += 1
                continue

            kept_ids = []
            for payload in selected_payloads:
                try:
                    item, created = MechanismEvidenceRequirement.objects.update_or_create(
                        mechanism=mechanism,
                        title=payload["title"],
                        evidence_type=payload["evidence_type"],
                        defaults={
                            "description": payload["description"],
                            "mechanism_type": mechanism.mechanism_type or "",
                            "keywords": payload["keywords"],
                            "control_domain": "",
                            "priority": payload["priority"],
                            "source": MechanismEvidenceRequirement.Source.RULE_BASED,
                            "rationale": payload["rationale"]
                            or "Requisito materializado automaticamente a partir do catalogo de templates.",
                            "is_active": True,
                        },
                    )
                    kept_ids.append(item.id)
                    if created:
                        stats["created"] += 1
                    else:
                        stats["updated"] += 1
                except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                    stats["errors"].append(f"{mechanism.title} / {payload['title']}: {exc}")

            if replace_specific and kept_ids:
                deactivated = (
                    MechanismEvidenceRequirement.objects.filter(mechanism=mechanism, is_active=True)
                    .exclude(id__in=kept_ids)
                    .exclude(source=MechanismEvidenceRequirement.Source.MANUAL)
                    .update(is_active=False)
                )
                stats["deactivated"] += deactivated

        return stats

    def refresh_required_by_links(self):
        stats = {"links": 0, "updated": 0, "skipped": 0, "errors": []}
        links = EvidenceLink.objects.filter(
            target_type=EvidenceLink.TargetType.MECHANISM,
            link_type=EvidenceLink.LinkType.REQUIRED_BY,
        ).select_related("evidence_item")

        for link in links:
            stats["links"] += 1
            try:
                mechanism = Mechanism.objects.get(id=link.target_id)
            except Mechanism.DoesNotExist:
                stats["skipped"] += 1
                continue

            payload = self.specific_requirement_payload(mechanism)
            evidence = link.evidence_item
            now = timezone.now()
            EvidenceItem.objects.filter(id=evidence.id).update(
                title=payload["title"],
                description=payload["description"],
                evidence_type=payload["evidence_type"],
                updated_at=now,
            )
            EvidenceLink.objects.filter(id=link.id).update(
                rationale=f"Evidencia esperada para validar a implementacao do mecanismo. {payload['rationale']}",
                mapping_source=EvidenceLink.MappingSource.RULE_BASED,
                updated_at=now,
            )
            stats["updated"] += 1

        return stats

    def handle(self, *args, **options):
        stats = {"total": 0, "created": 0, "updated": 0, "errors": []}

        for requirement in self.DEFAULT_REQUIREMENTS:
            stats["total"] += 1
            try:
                lookup = {
                    "mechanism": None,
                    "title": requirement["title"],
                    "evidence_type": requirement["evidence_type"],
                    "mechanism_type": requirement.get("mechanism_type", ""),
                    "control_domain": requirement.get("control_domain", ""),
                }
                _item, created = MechanismEvidenceRequirement.objects.update_or_create(
                    **lookup,
                    defaults={
                        "description": requirement.get("description", ""),
                        "keywords": requirement.get("keywords", []),
                        "priority": requirement.get("priority", MechanismEvidenceRequirement.Priority.MEDIUM),
                        "source": MechanismEvidenceRequirement.Source.TEMPLATE,
                        "rationale": requirement.get("rationale", ""),
                        "is_active": True,
                    },
                )
                if created:
                    stats["created"] += 1
                else:
                    stats["updated"] += 1
            except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                stats["errors"].append(f"{requirement.get('title', 'unknown')}: {exc}")

        self.stdout.write(self.style.SUCCESS("Catalogo de evidencias esperadas por mecanismo concluido."))
        self.stdout.write(f"Templates analisados: {stats['total']}")
        self.stdout.write(f"Templates criados: {stats['created']}")
        self.stdout.write(f"Templates atualizados: {stats['updated']}")
        if stats["errors"]:
            self.stdout.write(self.style.ERROR("Erros:"))
            for error in stats["errors"]:
                self.stdout.write(f"- {error}")
        else:
            self.stdout.write("Erros: 0")

        if options["materialize_for_mechanisms"]:
            materialized = self.materialize_for_mechanisms(
                options["max_per_mechanism"],
                replace_specific=options["replace_specific"],
            )
            self.stdout.write(self.style.SUCCESS("Materializacao por mecanismo concluida."))
            self.stdout.write(f"Mecanismos analisados: {materialized['mechanisms']}")
            self.stdout.write(f"Requisitos especificos criados: {materialized['created']}")
            self.stdout.write(f"Requisitos especificos atualizados: {materialized['updated']}")
            self.stdout.write(f"Requisitos especificos antigos desativados: {materialized['deactivated']}")
            self.stdout.write(f"Mecanismos sem templates aplicaveis: {materialized['without_templates']}")
            if materialized["errors"]:
                self.stdout.write(self.style.ERROR("Erros de materializacao:"))
                for error in materialized["errors"]:
                    self.stdout.write(f"- {error}")
            else:
                self.stdout.write("Erros de materializacao: 0")

        if options["refresh_required_by_links"]:
            refreshed = self.refresh_required_by_links()
            self.stdout.write(self.style.SUCCESS("Atualizacao de evidencias esperadas ligadas concluida."))
            self.stdout.write(f"Links required_by analisados: {refreshed['links']}")
            self.stdout.write(f"EvidenceItems atualizados: {refreshed['updated']}")
            self.stdout.write(f"Links ignorados: {refreshed['skipped']}")
            if refreshed["errors"]:
                self.stdout.write(self.style.ERROR("Erros ao atualizar links:"))
                for error in refreshed["errors"]:
                    self.stdout.write(f"- {error}")
            else:
                self.stdout.write("Erros ao atualizar links: 0")
