from datetime import timedelta

from django.utils import timezone

from governance.models import GovernanceAction
from governance.services.workbench_service import GovernanceWorkbenchService


class GovernanceActionPlanService:
    """Creates auditable governance actions from persisted operational gaps."""

    DEFAULT_OWNER = "CISO"

    WORKBENCH_RULES = {
        "pending_mappings": ("approve_mapping", "high", 7, "Validar mappings pendentes para passarem a contar como oficiais."),
        "draft_mappings": ("approve_mapping", "medium", 14, "Rever mappings em rascunho e decidir se devem ser aprovados, corrigidos ou rejeitados."),
        "missing_rationale": ("approve_mapping", "medium", 14, "Completar rationale dos mappings para reforcar defensabilidade em auditoria."),
        "policies_without_owner": ("correct_policy", "medium", 14, "Atribuir owner e responsabilidade formal as politicas sem dono."),
        "policies_without_controls": ("correct_policy", "high", 14, "Associar controlos internos as politicas para ativar rastreabilidade e scoring por propagacao."),
        "documents_without_controls": ("review_document", "medium", 21, "Associar documentos de governacao a controlos internos relevantes."),
        "overdue_documents": ("review_document", "high", 7, "Rever documentos com data de revisao vencida e atualizar estado documental."),
        "controls_without_mechanisms": ("implement_mechanism", "high", 14, "Associar mecanismos reutilizaveis aos controlos internos sem implementacao operacional."),
        "controls_without_framework": ("map_control", "medium", 21, "Mapear controlos internos para frameworks externas e aprovar os mappings."),
        "mechanisms_without_evidence": ("collect_evidence", "high", 14, "Recolher ou aprovar evidencia valida para os mecanismos sem prova operacional."),
        "expired_evidence": ("collect_evidence", "high", 7, "Atualizar, substituir ou arquivar evidencias expiradas."),
        "pending_exceptions": ("review_exception", "high", 7, "Validar excecoes e aceitacoes de risco pendentes."),
        "expired_exceptions": ("review_exception", "critical", 3, "Rever excecoes expiradas e decidir renovacao, mitigacao ou encerramento."),
        "expiring_exceptions": ("review_exception", "medium", 14, "Planear revisao de excecoes que expiram nos proximos 30 dias."),
        "low_confidence_mappings": ("approve_mapping", "medium", 14, "Rever mappings com baixa confianca antes de os usar como base oficial."),
        "low_coverage_frameworks": ("update_framework", "medium", 30, "Aumentar cobertura de frameworks com poucos controlos externos mapeados."),
    }

    ACTIVE_STATUSES = (
        GovernanceAction.Status.OPEN,
        GovernanceAction.Status.IN_PROGRESS,
        GovernanceAction.Status.BLOCKED,
        GovernanceAction.Status.DEFERRED,
    )

    @classmethod
    def generate_from_workbench(cls, owner=None, user=None):
        overview = GovernanceWorkbenchService.overview()
        today = timezone.localdate()
        created = 0
        updated = 0
        skipped = 0
        actions = []

        for item in overview.get("work_items", []):
            if item.get("count", 0) <= 0:
                skipped += 1
                continue
            rule = cls.WORKBENCH_RULES.get(item["id"])
            if not rule:
                skipped += 1
                continue

            action_type, priority, due_days, recommendation = rule
            due_date = today + timedelta(days=due_days)
            existing = GovernanceAction.objects.filter(
                source_type=GovernanceAction.SourceType.WORKBENCH,
                source_key=item["id"],
                status__in=cls.ACTIVE_STATUSES,
            ).first()

            payload = {
                "action_type": action_type,
                "title": item["title"],
                "description": f"{item['description']} Total atual: {item['count']}.",
                "recommendation": recommendation,
                "target_type": item["category"],
                "target_id": item["id"],
                "source_type": GovernanceAction.SourceType.WORKBENCH,
                "source_key": item["id"],
                "owner": owner or cls.DEFAULT_OWNER,
                "priority": priority,
                "due_date": due_date,
                "notes": cls.execution_notes(
                    action_type=action_type,
                    title=item["title"],
                    description=f"{item['description']} Total atual: {item['count']}.",
                    recommendation=recommendation,
                    source_key=item["id"],
                    target_label=item.get("category", ""),
                ),
            }

            if existing:
                for field, value in payload.items():
                    if field == "owner" and existing.owner:
                        continue
                    if field == "notes" and existing.notes:
                        continue
                    setattr(existing, field, value)
                if user and getattr(user, "is_authenticated", False):
                    existing.updated_by = user
                existing.save()
                action = existing
                updated += 1
            else:
                action = GovernanceAction.objects.create(
                    **payload,
                    created_by=user if user and getattr(user, "is_authenticated", False) else None,
                    updated_by=user if user and getattr(user, "is_authenticated", False) else None,
                )
                created += 1
            actions.append(action)

        return {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total": len(actions),
            "actions": actions,
        }

    @classmethod
    def execution_notes_for_action(cls, action):
        return cls.execution_notes(
            action_type=action.action_type,
            title=action.title,
            description=action.description,
            recommendation=action.recommendation,
            source_key=action.source_key,
            target_label=action.target_label if hasattr(action, "target_label") else action.target_id,
        )

    @classmethod
    def execution_notes(cls, action_type, title, description="", recommendation="", source_key="", target_label=""):
        steps = cls._execution_steps(action_type, source_key)
        closing = cls._completion_criteria(action_type)
        lines = [
            "Objetivo",
            f"- {description or recommendation or title}",
            "",
            "Como executar",
        ]
        lines.extend(f"{index}. {step}" for index, step in enumerate(steps, start=1))
        lines.extend([
            "",
            "Criterio de conclusao",
            f"- {closing}",
            "",
            "Registo e evidencia",
            "- Registar a decisao ou alteracao efetuada na pagina correspondente.",
            "- Associar evidencia, comentario ou referencia quando a tarefa tiver impacto em auditoria.",
        ])
        if recommendation:
            lines.extend(["", "Recomendacao de contexto", f"- {recommendation}"])
        if target_label:
            lines.extend(["", "Alvo", f"- {target_label}"])
        return "\n".join(lines)

    @staticmethod
    def _execution_steps(action_type, source_key=""):
        if action_type == GovernanceAction.ActionType.APPROVE_MAPPING:
            return [
                "Abrir o Mapping Review com o filtro aplicavel ao item de trabalho.",
                "Confirmar origem, destino, tipo de relacao, cobertura, confianca e rationale.",
                "Corrigir rationale, cobertura ou confidence_score quando estiver incompleto.",
                "Aprovar mappings defensaveis, rejeitar mappings errados e marcar como deprecated relacoes obsoletas.",
            ]
        if action_type == GovernanceAction.ActionType.CORRECT_POLICY:
            return [
                "Abrir a politica afetada e confirmar owner, estado, data de revisao e conteudo documental.",
                "Atualizar campos obrigatorios e completar capitulos ou subcapitulos em falta.",
                "Associar controlos internos quando a politica ainda nao tiver rastreabilidade.",
                "Guardar a politica e validar se a pagina de detalhe passou a refletir a correcao.",
            ]
        if action_type == GovernanceAction.ActionType.REVIEW_DOCUMENT:
            return [
                "Abrir a lista de documentos de governacao e filtrar pelo item indicado.",
                "Rever versao, estado, owner, parent_document, data de aprovacao e proxima revisao.",
                "Atualizar secoes, runbook steps ou relacoes com controlos internos quando aplicavel.",
                "Registar a revisao efetuada e criar acao adicional se existir dependencia.",
            ]
        if action_type == GovernanceAction.ActionType.IMPLEMENT_MECHANISM:
            return [
                "Abrir o mecanismo ou o controlo interno afetado e confirmar o contexto de implementacao.",
                "Definir tarefas tecnicas, owners, recursos, prazo e evidencias esperadas.",
                "Executar a configuracao ou processo definido em ambiente controlado.",
                "Atualizar o estado operacional e validar impacto no scoring de conformidade.",
            ]
        if action_type == GovernanceAction.ActionType.MAP_CONTROL:
            return [
                "Abrir o Framework Mapping Wizard ou o Mapping Review.",
                "Selecionar o controlo interno e a framework externa relevante.",
                "Mapear o controlo externo correspondente com relationship_type, coverage_percentage e rationale.",
                "Submeter para validacao humana e aprovar apenas quando o mapping estiver defensavel.",
            ]
        if action_type == GovernanceAction.ActionType.COLLECT_EVIDENCE:
            return [
                "Identificar o mecanismo, controlo, documento ou politica que necessita de evidencia.",
                "Criar ou selecionar EvidenceItem no catalogo de evidencias.",
                "Associar a evidencia ao alvo correto por EvidenceLink com link_type e rationale adequados.",
                "Validar validade, confidence_level e estado da evidencia antes de contar para score oficial.",
            ]
        if action_type == GovernanceAction.ActionType.REVIEW_EXCEPTION:
            return [
                "Abrir a excecao ou aceitacao de risco indicada.",
                "Confirmar justificacao de negocio, prazo de validade, owner, aprovador e controlo compensatorio.",
                "Decidir aprovar, rejeitar, revogar ou converter em acao de mitigacao.",
                "Registar impacto no risco, conformidade e score.",
            ]
        if action_type == GovernanceAction.ActionType.UPDATE_FRAMEWORK:
            return [
                "Abrir a framework ou matriz de mapeamento relevante.",
                "Identificar controlos externos sem cobertura ou com baixa cobertura.",
                "Criar ou rever mappings com controlos internos canonicos.",
                "Recalcular ou rever o score e documentar gaps remanescentes.",
            ]
        return [
            "Abrir o alvo indicado na tarefa.",
            "Confirmar o contexto, impacto e informacao em falta.",
            "Executar a correcao ou atualizacao necessaria.",
            "Registar evidencia ou decisao quando a tarefa ficar concluida.",
        ]

    @staticmethod
    def _completion_criteria(action_type):
        if action_type == GovernanceAction.ActionType.APPROVE_MAPPING:
            return "Os mappings relevantes ficam aprovados, rejeitados ou marcados como deprecated, sem pendencias sem decisao."
        if action_type == GovernanceAction.ActionType.COLLECT_EVIDENCE:
            return "Existe evidencia valida associada ao alvo correto e pronta para validacao/aprovacao."
        if action_type == GovernanceAction.ActionType.IMPLEMENT_MECHANISM:
            return "O mecanismo tem plano executado, estado operacional revisto e evidencia esperada definida ou recolhida."
        if action_type == GovernanceAction.ActionType.CORRECT_POLICY:
            return "A politica fica com ownership, conteudo e controlos internos coerentes com a governacao pretendida."
        return "A causa da tarefa fica resolvida ou documentada com uma decisao formal e proximo passo claro."
