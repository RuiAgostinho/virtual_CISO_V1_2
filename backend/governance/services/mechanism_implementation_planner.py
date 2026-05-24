import json
import re
from datetime import timedelta

from django.db import models
from django.utils import timezone

from ciso_assistant.services.ollama_client import OllamaClient
from governance.models import (
    EvidenceItem,
    EvidenceLink,
    GovernanceAction,
    InternalControlMechanism,
    MechanismEvidenceRequirement,
)


class MechanismImplementationPlanner:
    """Builds implementation tasks for reusable mechanisms.

    The planner keeps the LLM optional. When the local model is unavailable or
    returns malformed JSON, deterministic templates still create a usable plan.
    """

    DEFAULT_ROLES = "CISO\nResponsavel tecnico\nOwner do controlo"
    DEFAULT_MATERIALS = "Inventario de ativos/sistemas\nProcedimentos internos\nFerramenta ou plataforma aplicavel"

    @classmethod
    def suggest(cls, mechanism):
        context = cls._context(mechanism)
        llm_tasks = cls._llm_tasks(context)
        if llm_tasks:
            return {
                "mechanism": str(mechanism.id),
                "generated_by": "llm",
                "llm_available": True,
                "tasks": [cls._normalize_task(task, index) for index, task in enumerate(llm_tasks, start=1)],
                "context": context,
            }

        return {
            "mechanism": str(mechanism.id),
            "generated_by": "template",
            "llm_available": False,
            "tasks": cls._template_tasks(context),
            "context": context,
        }

    @classmethod
    def create_actions(cls, mechanism, tasks=None, owner="", user=None):
        suggestion = cls.suggest(mechanism) if tasks is None else {"tasks": tasks, "generated_by": "manual"}
        created = 0
        updated = 0
        skipped = 0
        actions = []
        today = timezone.localdate()

        for index, task in enumerate(suggestion.get("tasks", []), start=1):
            normalized = cls._normalize_task(task, index)
            source_key = cls._source_key(mechanism, normalized["title"])
            due_days = int(normalized.get("due_days") or 30)
            action_type = normalized.get("action_type") or GovernanceAction.ActionType.IMPLEMENT_MECHANISM
            payload = {
                "action_type": action_type,
                "title": normalized["title"],
                "description": normalized.get("description", ""),
                "recommendation": normalized.get("recommendation") or normalized.get("rationale", ""),
                "target_type": "mechanism",
                "target_id": str(mechanism.id),
                "source_type": GovernanceAction.SourceType.AI_RECOMMENDATION,
                "source_key": source_key,
                "owner": owner or normalized.get("owner") or "CISO",
                "priority": normalized.get("priority") or GovernanceAction.Priority.MEDIUM,
                "due_date": today + timedelta(days=due_days),
                "estimated_effort_hours": normalized.get("estimated_effort_hours"),
                "required_roles": cls._text_list(normalized.get("required_roles")) or cls.DEFAULT_ROLES,
                "required_materials": cls._text_list(normalized.get("required_materials")) or cls.DEFAULT_MATERIALS,
                "evidence_required": bool(normalized.get("evidence_required", True)),
                "expected_evidence": normalized.get("expected_evidence", ""),
                "ai_generated": suggestion.get("generated_by") in {"llm", "template"},
                "ai_rationale": normalized.get("rationale", ""),
                "dependency_notes": normalized.get("dependency_notes", ""),
                "notes": normalized.get("notes") or cls.execution_notes(mechanism, normalized),
            }

            existing = GovernanceAction.objects.filter(
                source_type=GovernanceAction.SourceType.AI_RECOMMENDATION,
                source_key=source_key,
                status__in=[
                    GovernanceAction.Status.OPEN,
                    GovernanceAction.Status.IN_PROGRESS,
                    GovernanceAction.Status.BLOCKED,
                    GovernanceAction.Status.DEFERRED,
                ],
            ).first()
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
                updated += 1
                actions.append(existing)
                continue

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
            "suggestion": suggestion,
        }

    @classmethod
    def template_tasks(cls, mechanism):
        """Return deterministic implementation tasks without calling the LLM."""
        return cls._template_tasks(cls._context(mechanism))

    @classmethod
    def create_template_actions(cls, mechanism, owner="", user=None):
        """Create implementation tasks from the deterministic mechanism template."""
        return cls.create_actions(
            mechanism,
            tasks=cls.template_tasks(mechanism),
            owner=owner,
            user=user,
        )

    @classmethod
    def readiness(cls, mechanism):
        """Return the human-review recommendation for implementation status.

        This does not update any control mapping. It only combines real task
        progress and approved valid evidence to decide which state should be
        proposed to the CISO.
        """
        active_actions = list(cls._active_actions(mechanism))
        done_actions = [action for action in active_actions if action.status == GovernanceAction.Status.DONE]
        open_actions = [action for action in active_actions if action.status == GovernanceAction.Status.OPEN]
        blocked_actions = [action for action in active_actions if action.status == GovernanceAction.Status.BLOCKED]
        deferred_actions = [action for action in active_actions if action.status == GovernanceAction.Status.DEFERRED]
        in_progress_actions = [
            action
            for action in active_actions
            if action.status in {
                GovernanceAction.Status.IN_PROGRESS,
                GovernanceAction.Status.BLOCKED,
                GovernanceAction.Status.DEFERRED,
            }
        ]
        evidence_links = list(cls._valid_evidence_links(mechanism))
        links = list(cls._active_internal_control_links(mechanism))

        total_actions = len(active_actions)
        done_count = len(done_actions)
        progress_percentage = round((done_count / total_actions) * 100) if total_actions else 0
        all_tasks_done = total_actions > 0 and done_count == total_actions
        has_valid_evidence = bool(evidence_links)

        recommended_status = None
        readiness_status = "not_planned"
        reasons = []
        blockers = []

        if total_actions == 0:
            blockers.append("Ainda nao existem tarefas de implementacao para este mecanismo.")
            reasons.append("Criar ou gerar tarefas antes de recomendar alteracao de estado.")
        elif all_tasks_done and has_valid_evidence:
            readiness_status = "ready_for_evidenced"
            recommended_status = InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED
            reasons.append("Todas as tarefas ativas estao concluidas e existe evidencia valida aprovada.")
        elif all_tasks_done:
            readiness_status = "ready_for_implemented"
            recommended_status = InternalControlMechanism.ImplementationStatus.IMPLEMENTED
            blockers.append("Nao existe EvidenceItem valida com EvidenceLink aprovado para este mecanismo.")
            reasons.append("As tarefas estao concluidas, mas a evidencia ainda nao permite marcar como evidenciado.")
        elif done_actions or in_progress_actions:
            readiness_status = "in_progress"
            recommended_status = InternalControlMechanism.ImplementationStatus.PARTIALLY_IMPLEMENTED
            blockers.append("Ainda existem tarefas por concluir.")
            reasons.append("Ja existe execucao operacional, mas o plano nao esta completo.")
        else:
            readiness_status = "planned"
            recommended_status = InternalControlMechanism.ImplementationStatus.PLANNED
            blockers.append("Nenhuma tarefa foi concluida.")
            reasons.append("Existe plano de trabalho, mas a implementacao ainda nao avancou.")

        applicable_links = [
            link for link in links
            if recommended_status and link.implementation_status != recommended_status
        ]

        return {
            "mechanism": str(mechanism.id),
            "generated_at": timezone.now().isoformat(),
            "recommendation_source": "governance_actions",
            "requires_human_validation": True,
            "readiness_status": readiness_status,
            "recommended_status": recommended_status,
            "recommended_status_label": cls._implementation_status_label(recommended_status),
            "can_apply": bool(recommended_status and applicable_links),
            "tasks": {
                "total": total_actions,
                "done": done_count,
                "open": len(open_actions),
                "in_progress": len(in_progress_actions),
                "blocked": len(blocked_actions),
                "deferred": len(deferred_actions),
                "progress_percentage": progress_percentage,
                "all_done": all_tasks_done,
                "items": [
                    {
                        "id": str(action.id),
                        "title": action.title,
                        "status": action.status,
                        "priority": action.priority,
                        "due_date": action.due_date.isoformat() if action.due_date else None,
                        "evidence_required": action.evidence_required,
                    }
                    for action in active_actions[:20]
                ],
            },
            "evidence": {
                "valid_approved": len(evidence_links),
                "has_valid_approved": has_valid_evidence,
                "items": [
                    {
                        "id": str(link.evidence_item_id),
                        "title": link.evidence_item.title,
                        "evidence_type": link.evidence_item.evidence_type,
                        "valid_until": link.evidence_item.valid_until.isoformat() if link.evidence_item.valid_until else None,
                        "confidence_level": float(link.evidence_item.confidence_level),
                    }
                    for link in evidence_links[:10]
                ],
            },
            "internal_control_mechanisms": [
                {
                    "id": str(link.id),
                    "internal_control": str(link.internal_control_id),
                    "internal_control_code": link.internal_control.code,
                    "internal_control_title": link.internal_control.title,
                    "current_status": link.implementation_status,
                    "current_status_label": link.get_implementation_status_display(),
                    "will_change": bool(recommended_status and link.implementation_status != recommended_status),
                }
                for link in links
            ],
            "applicable_count": len(applicable_links),
            "reasons": reasons,
            "blockers": blockers,
        }

    @classmethod
    def apply_readiness_recommendation(cls, mechanism, user=None, link_ids=None, rationale=""):
        readiness = cls.readiness(mechanism)
        recommended_status = readiness.get("recommended_status")
        if not recommended_status:
            return {
                "updated": 0,
                "readiness": readiness,
                "links": [],
            }

        queryset = cls._active_internal_control_links(mechanism)
        if link_ids:
            queryset = queryset.filter(id__in=link_ids)

        links = list(queryset.exclude(implementation_status=recommended_status))
        update_fields = ["implementation_status", "updated_at"]
        for link in links:
            link.implementation_status = recommended_status
            if rationale:
                audit_note = f"Validacao humana por tarefas: {rationale}"
                link.rationale = f"{link.rationale}\n\n{audit_note}".strip() if link.rationale else audit_note
                if "rationale" not in update_fields:
                    update_fields.append("rationale")
            if user and getattr(user, "is_authenticated", False):
                link.updated_by = user
                if "updated_by" not in update_fields:
                    update_fields.append("updated_by")
            link.save(update_fields=update_fields)

        return {
            "updated": len(links),
            "readiness": cls.readiness(mechanism),
            "links": links,
        }

    @classmethod
    def _context(cls, mechanism):
        control_links = list(
            InternalControlMechanism.objects.select_related("internal_control")
            .filter(mechanism=mechanism)
            .exclude(validation_status__in=["rejected", "deprecated"])[:20]
        )
        evidence_requirements = list(
            MechanismEvidenceRequirement.objects.filter(is_active=True)
            .filter(mechanism=mechanism)[:12]
        )
        if not evidence_requirements:
            evidence_requirements = [
                requirement
                for requirement in MechanismEvidenceRequirement.objects.filter(is_active=True, mechanism__isnull=True)[:50]
                if requirement.matches_mechanism(mechanism)
            ][:12]

        return {
            "id": str(mechanism.id),
            "title": mechanism.title,
            "description": mechanism.description,
            "mechanism_type": mechanism.mechanism_type,
            "internal_controls": [
                {
                    "id": str(link.internal_control_id),
                    "code": link.internal_control.code,
                    "title": link.internal_control.title,
                    "domain": link.internal_control.control_domain,
                    "criticality": link.internal_control.criticality,
                    "mandatory": link.mandatory,
                    "implementation_status": link.implementation_status,
                }
                for link in control_links
            ],
            "evidence_requirements": [
                {
                    "title": requirement.title,
                    "description": requirement.description,
                    "evidence_type": requirement.evidence_type,
                    "priority": requirement.priority,
                }
                for requirement in evidence_requirements
            ],
        }

    @staticmethod
    def _active_actions(mechanism):
        return (
            GovernanceAction.objects
            .filter(target_type="mechanism", target_id=str(mechanism.id))
            .exclude(status=GovernanceAction.Status.CANCELLED)
            .order_by("due_date", "created_at")
        )

    @staticmethod
    def _active_internal_control_links(mechanism):
        return (
            InternalControlMechanism.objects
            .select_related("internal_control", "mechanism")
            .filter(mechanism=mechanism)
            .exclude(
                validation_status__in=[
                    InternalControlMechanism.ValidationStatus.REJECTED,
                    InternalControlMechanism.ValidationStatus.DEPRECATED,
                ]
            )
        )

    @staticmethod
    def _valid_evidence_links(mechanism):
        return (
            EvidenceLink.objects
            .select_related("evidence_item")
            .filter(
                target_type=EvidenceLink.TargetType.MECHANISM,
                target_id=mechanism.id,
                validation_status=EvidenceLink.ValidationStatus.APPROVED,
                evidence_item__is_active=True,
                evidence_item__status=EvidenceItem.Status.VALID,
            )
            .filter(
                models.Q(evidence_item__valid_until__isnull=True)
                | models.Q(evidence_item__valid_until__gte=timezone.localdate())
            )
            .order_by("evidence_item__title")
        )

    @staticmethod
    def _implementation_status_label(status):
        if not status:
            return ""
        return dict(InternalControlMechanism.ImplementationStatus.choices).get(status, status)

    @classmethod
    def _llm_tasks(cls, context):
        prompt = (
            "Atua como Virtual CISO. Gera um plano operacional em portugues de Portugal para implementar "
            "o mecanismo de ciberseguranca seguinte. Responde apenas com JSON valido no formato "
            "{\"tasks\":[{\"title\":\"...\",\"description\":\"...\",\"priority\":\"medium\","
            "\"estimated_effort_hours\":8,\"required_roles\":[\"CISO\"],\"required_materials\":[\"...\"],"
            "\"evidence_required\":true,\"expected_evidence\":\"...\",\"due_days\":14,"
            "\"dependency_notes\":\"...\",\"rationale\":\"...\"}]}.\n\n"
            f"Contexto: {json.dumps(context, ensure_ascii=False)}"
        )
        raw = OllamaClient.call(
            prompt,
            temperature=0.2,
            options={"num_predict": 1800},
            timeout_seconds=180,
        )
        if OllamaClient.is_service_error(raw):
            return []
        try:
            parsed = json.loads(raw)
        except Exception:
            match = re.search(r"\{.*\}", raw or "", re.DOTALL)
            if not match:
                return []
            try:
                parsed = json.loads(match.group(0))
            except Exception:
                return []
        tasks = parsed.get("tasks") if isinstance(parsed, dict) else None
        return tasks if isinstance(tasks, list) else []

    @classmethod
    def _template_tasks(cls, context):
        title = str(context.get("title") or "mecanismo")
        evidence_title = "Evidencia operacional de implementacao"
        if context.get("evidence_requirements"):
            evidence_title = context["evidence_requirements"][0].get("title") or evidence_title

        base = [
            {
                "title": f"Definir ambito de implementacao - {title}",
                "description": "Identificar sistemas, processos, owners e controlos internos onde o mecanismo sera aplicado.",
                "priority": "high",
                "estimated_effort_hours": 4,
                "required_roles": ["CISO", "Owner do controlo", "Responsavel tecnico"],
                "required_materials": ["Inventario de ativos", "Lista de controlos internos associados"],
                "evidence_required": True,
                "expected_evidence": "Registo de ambito aprovado ou ticket de planeamento.",
                "due_days": 7,
                "dependency_notes": "Depende de inventario e ownership minimamente definidos.",
                "rationale": "Sem ambito claro nao e possivel defender a cobertura do mecanismo.",
            },
            {
                "title": f"Desenhar configuracao operacional - {title}",
                "description": "Definir parametros, regras, excecoes e criterio de aceitacao para colocar o mecanismo em producao.",
                "priority": "high",
                "estimated_effort_hours": 8,
                "required_roles": ["Responsavel tecnico", "CISO"],
                "required_materials": ["Procedimento tecnico", "Acesso a plataforma ou sistema alvo"],
                "evidence_required": True,
                "expected_evidence": "Documento tecnico, configuracao exportada ou plano de implementacao aprovado.",
                "due_days": 14,
                "dependency_notes": "Pode exigir validacao com equipas de operacao ou fornecedores.",
                "rationale": "A configuracao traduz o mecanismo em pratica operacional auditavel.",
            },
            {
                "title": f"Implementar e testar - {title}",
                "description": "Executar a implementacao, testar funcionamento e confirmar que nao ha impacto indevido no negocio.",
                "priority": "high",
                "estimated_effort_hours": 12,
                "required_roles": ["Responsavel tecnico", "Owner do sistema"],
                "required_materials": ["Ambiente tecnico", "Credenciais autorizadas", "Plano de testes"],
                "evidence_required": True,
                "expected_evidence": evidence_title,
                "due_days": 21,
                "dependency_notes": "Pode depender de janela de manutencao.",
                "rationale": "O mecanismo so deve evoluir para implementado apos teste operacional.",
            },
            {
                "action_type": "collect_evidence",
                "title": f"Recolher evidencia e validar - {title}",
                "description": "Associar evidencia real ao mecanismo e validar se suporta o estado implementado/evidenciado.",
                "priority": "medium",
                "estimated_effort_hours": 4,
                "required_roles": ["CISO", "Auditor interno", "Responsavel tecnico"],
                "required_materials": ["EvidenceItem", "Mapping Review", "Checklist de validacao"],
                "evidence_required": True,
                "expected_evidence": evidence_title,
                "due_days": 28,
                "dependency_notes": "Depende da existencia de evidencia recolhida e aprovada.",
                "rationale": "A evidencia fecha o ciclo entre implementacao, conformidade e auditoria.",
            },
        ]
        return [cls._normalize_task(task, index) for index, task in enumerate(base, start=1)]

    @classmethod
    def _normalize_task(cls, task, index):
        if not isinstance(task, dict):
            task = {"title": str(task)}
        priority = str(task.get("priority") or "medium").lower()
        if priority not in {"low", "medium", "high", "critical"}:
            priority = "medium"
        try:
            effort = float(task.get("estimated_effort_hours") or 0)
        except (TypeError, ValueError):
            effort = 0
        return {
            "action_type": cls._action_type(task),
            "title": str(task.get("title") or f"Tarefa {index}").strip(),
            "description": str(task.get("description") or "").strip(),
            "recommendation": str(task.get("recommendation") or task.get("description") or "").strip(),
            "priority": priority,
            "estimated_effort_hours": effort or None,
            "required_roles": task.get("required_roles") or [],
            "required_materials": task.get("required_materials") or [],
            "evidence_required": bool(task.get("evidence_required", True)),
            "expected_evidence": str(task.get("expected_evidence") or "").strip(),
            "due_days": int(task.get("due_days") or 30),
            "dependency_notes": str(task.get("dependency_notes") or "").strip(),
            "rationale": str(task.get("rationale") or "").strip(),
            "owner": str(task.get("owner") or "").strip(),
            "notes": str(task.get("notes") or "").strip(),
        }

    @classmethod
    def execution_notes_for_action(cls, mechanism, action):
        return cls.execution_notes(
            mechanism,
            {
                "title": action.title,
                "description": action.description,
                "recommendation": action.recommendation,
                "required_roles": action.required_roles,
                "required_materials": action.required_materials,
                "expected_evidence": action.expected_evidence,
                "dependency_notes": action.dependency_notes,
                "action_type": action.action_type,
            },
        )

    @classmethod
    def execution_notes(cls, mechanism, task):
        title = str(task.get("title") or "")
        lower_title = title.lower()
        mechanism_title = getattr(mechanism, "title", "") or getattr(mechanism, "name", "") or "mecanismo"
        objective = task.get("description") or task.get("recommendation") or f"Executar a tarefa no contexto do mecanismo {mechanism_title}."

        if "ambito" in lower_title:
            steps = [
                "Listar os sistemas, processos, ativos e owners onde o mecanismo deve ser aplicado.",
                "Confirmar que controlos internos este mecanismo suporta e se a associacao e obrigatoria.",
                "Registar exclusoes, dependencias e pressupostos antes de avancar para configuracao.",
                "Validar o ambito com o CISO e com o owner tecnico.",
            ]
            completion = "Ambito aprovado, com sistemas/processos abrangidos e exclusoes documentadas."
        elif "configuracao" in lower_title or "desenhar" in lower_title:
            steps = [
                "Definir parametros, regras, excecoes e criterios de aceitacao do mecanismo.",
                "Confirmar acessos, plataformas e pre-requisitos tecnicos necessarios.",
                "Documentar a configuracao proposta e alinhar com politicas/controlos internos aplicaveis.",
                "Obter validacao tecnica antes de executar alteracoes em producao.",
            ]
            completion = "Configuracao definida, revista e pronta para implementacao controlada."
        elif "implementar" in lower_title or "testar" in lower_title:
            steps = [
                "Executar a configuracao ou processo aprovado no ambiente definido.",
                "Testar o comportamento esperado e confirmar que nao existe impacto indevido no negocio.",
                "Corrigir desvios identificados durante o teste.",
                "Atualizar o estado operacional do mecanismo quando a implementacao estiver validada.",
            ]
            completion = "Mecanismo implementado e testado, com resultado documentado."
        elif "evid" in lower_title or "recolh" in lower_title:
            steps = [
                "Identificar as evidencias esperadas para este mecanismo.",
                "Recolher evidencia real, como configuracao exportada, log, ticket, screenshot ou aprovacao formal.",
                "Criar ou selecionar EvidenceItem no catalogo de evidencias.",
                "Associar a evidencia ao mecanismo com EvidenceLink e submeter para validacao/aprovacao.",
            ]
            completion = "Evidencia real associada ao mecanismo e pronta para contar em auditoria quando aprovada."
        else:
            steps = [
                "Abrir o detalhe do mecanismo e confirmar o contexto da tarefa.",
                "Identificar os controlos internos, owners e recursos necessarios.",
                "Executar a atividade indicada e registar resultado.",
                "Atualizar estado, evidencias ou dependencias associadas.",
            ]
            completion = "Tarefa concluida com resultado registado e rastreavel no mecanismo."

        lines = [
            "Objetivo",
            f"- {objective}",
            "",
            "Como executar",
        ]
        lines.extend(f"{index}. {step}" for index, step in enumerate(steps, start=1))
        lines.extend([
            "",
            "Criterio de conclusao",
            f"- {completion}",
        ])

        roles = cls._text_list(task.get("required_roles"))
        materials = cls._text_list(task.get("required_materials"))
        expected_evidence = str(task.get("expected_evidence") or "").strip()
        dependencies = str(task.get("dependency_notes") or "").strip()

        if roles:
            lines.extend(["", "RH envolvidos", roles])
        if materials:
            lines.extend(["", "Recursos materiais/informacionais", materials])
        if expected_evidence:
            lines.extend(["", "Evidencia esperada", f"- {expected_evidence}"])
        if dependencies:
            lines.extend(["", "Dependencias", f"- {dependencies}"])

        lines.extend([
            "",
            "Registo",
            "- Quando terminares, marca a tarefa como concluida e adiciona referencia a evidencia, ticket ou decisao associada.",
        ])
        return "\n".join(lines)

    @staticmethod
    def _action_type(task):
        raw = str(task.get("action_type") or "").strip()
        if raw in {choice.value for choice in GovernanceAction.ActionType}:
            return raw
        title = str(task.get("title") or "").lower()
        if "evid" in title or "recolh" in title:
            return GovernanceAction.ActionType.COLLECT_EVIDENCE
        return GovernanceAction.ActionType.IMPLEMENT_MECHANISM

    @staticmethod
    def _source_key(mechanism, title):
        slug = re.sub(r"[^a-z0-9]+", "-", str(title).lower()).strip("-")[:60]
        return f"mechanism-plan:{mechanism.id}:{slug}"

    @staticmethod
    def _text_list(value):
        if isinstance(value, list):
            return "\n".join(str(item).strip() for item in value if str(item).strip())
        return str(value or "").strip()
