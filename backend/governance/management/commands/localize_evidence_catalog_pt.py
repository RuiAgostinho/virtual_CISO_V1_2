import os

from django.core.management.base import BaseCommand
from django.db import IntegrityError

from governance.models import EvidenceItem, MechanismEvidenceRequirement


TEXT_REPLACEMENTS = [
    ("DEMO UC1 - Evidencia WAF e patching QA", "DEMO UC1 - Evidencia de WAF e aplicacao de correcoes em QA"),
    ("Registo demonstrativo de WAF ativo, segmentacao interna e janela de patching aprovada.", "Registo demonstrativo de WAF ativo, segmentacao interna e janela de aplicacao de correcoes aprovada."),
    ("Risk Register", "Registo de Riscos"),
    ("Workflow", "Fluxo de trabalho"),
    ("Background Checks", "Verificacao de Antecedentes"),
    ("Questionario", "Questionario"),
    ("Avaliacao", "Avaliacao"),
    ("avaliacao", "avaliacao"),
    ("clausulas", "clausulas"),
    ("seguranca", "seguranca"),
    ("responsaveis", "responsaveis"),
    ("responsavel", "responsavel"),
    ("evidencias", "evidencias"),
    ("Evidencia", "Evidencia"),
    ("evidencia", "evidencia"),
    ("Exportacao", "Exportacao"),
    ("exportacao", "exportacao"),
    ("configuracao", "configuracao"),
    ("Configuracao", "Configuracao"),
    ("tecnica", "tecnica"),
    ("tecnico", "tecnico"),
    ("excecoes", "excecoes"),
    ("catalogo", "catalogo"),
    ("inventario", "inventario"),
    ("interligacoes", "interligacoes"),
    ("atualizacao", "atualizacao"),
    ("execucao", "execucao"),
    ("restauro", "restauro"),
    ("aceitacao", "aceitacao"),
    ("Copia", "Copia"),
    ("copia", "copia"),
    ("instrucao", "instrucao"),
    ("Politica", "Politica"),
    ("politica", "politica"),
    ("Relatorio", "Relatorio"),
    ("relatorio", "relatorio"),
    ("participacao", "participacao"),
    ("formacao", "formacao"),
    ("presencas", "presencas"),
    ("conteudo", "conteudo"),
    ("aprovacao", "aprovacao"),
    ("verificacao", "verificacao"),
    ("antecedentes", "antecedentes"),
    ("Ambito", "Ambito"),
    ("ambito", "ambito"),
    ("pos-incidente", "pos-incidente"),
    ("decisao", "decisao"),
    ("retencao", "retencao"),
    ("notificacao", "notificacao"),
    ("videovigilancia", "videovigilancia"),
    ("cameras", "camaras"),
    ("servicos", "servicos"),
    ("criticos", "criticos"),
    ("informacao", "informacao"),
    ("confianca", "confianca"),
    ("validacao", "validacao"),
    ("implementacao", "implementacao"),
    ("revisao", "revisao"),
    ("periodica", "periodica"),
    ("manutencao", "manutencao"),
    ("permissoes", "permissoes"),
    ("substituida", "substituida"),
    ("segmentacao", "segmentacao"),
    ("criterios", "criterios"),
    ("proteccao", "protecao"),
]


ACCENT_REPLACEMENTS = [
    ("Questionario", "Questionário"),
    ("Avaliacao", "Avaliação"),
    ("avaliacao", "avaliação"),
    ("clausulas", "cláusulas"),
    ("seguranca", "segurança"),
    ("responsaveis", "responsáveis"),
    ("responsavel", "responsável"),
    ("evidencias", "evidências"),
    ("Evidencia", "Evidência"),
    ("evidencia", "evidência"),
    ("Exportacao", "Exportação"),
    ("exportacao", "exportação"),
    ("configuracao", "configuração"),
    ("Configuracao", "Configuração"),
    ("tecnica", "técnica"),
    ("tecnico", "técnico"),
    ("excecoes", "exceções"),
    ("catalogo", "catálogo"),
    ("inventario", "inventário"),
    ("interligacoes", "interligações"),
    ("atualizacao", "atualização"),
    ("execucao", "execução"),
    ("aceitacao", "aceitação"),
    ("Copia", "Cópia"),
    ("copia", "cópia"),
    ("instrucao", "instrução"),
    ("Politica", "Política"),
    ("politica", "política"),
    ("Relatorio", "Relatório"),
    ("relatorio", "relatório"),
    ("participacao", "participação"),
    ("formacao", "formação"),
    ("presencas", "presenças"),
    ("conteudo", "conteúdo"),
    ("aprovacao", "aprovação"),
    ("verificacao", "verificação"),
    ("Ambito", "Âmbito"),
    ("ambito", "âmbito"),
    ("pos-incidente", "pós-incidente"),
    ("decisao", "decisão"),
    ("retencao", "retenção"),
    ("notificacao", "notificação"),
    ("videovigilancia", "videovigilância"),
    ("camaras", "câmaras"),
    ("servicos", "serviços"),
    ("criticos", "críticos"),
    ("informacao", "informação"),
    ("confianca", "confiança"),
    ("validacao", "validação"),
    ("implementacao", "implementação"),
    ("revisao", "revisão"),
    ("periodica", "periódica"),
    ("manutencao", "manutenção"),
    ("permissoes", "permissões"),
    ("substituida", "substituída"),
    ("segmentacao", "segmentação"),
    ("criterios", "critérios"),
    ("protecao", "proteção"),
    ("aplicacao de correcoes", "aplicação de correções"),
]


def normalize_text(value):
    if not value:
        return value
    normalized = str(value)
    for source, target in TEXT_REPLACEMENTS:
        normalized = normalized.replace(source, target)
    for source, target in ACCENT_REPLACEMENTS:
        normalized = normalized.replace(source, target)
    return normalized


class Command(BaseCommand):
    help = "Normaliza evidencias reais e tipos de evidencia esperada para portugues de Portugal."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        os.environ.setdefault("VIRTUAL_CISO_DISABLE_RAG_SIGNALS", "1")
        dry_run = bool(options["dry_run"])
        updated_items = 0
        updated_requirements = 0
        conflicts = 0

        for evidence in EvidenceItem.objects.order_by("title"):
            updates = {
                "title": normalize_text(evidence.title),
                "description": normalize_text(evidence.description),
            }
            changed_fields = [
                field
                for field, value in updates.items()
                if getattr(evidence, field) != value
            ]
            if not changed_fields:
                continue
            if not dry_run:
                for field in changed_fields:
                    setattr(evidence, field, updates[field])
                evidence.save(update_fields=[*changed_fields, "updated_at"])
            updated_items += 1

        for requirement in MechanismEvidenceRequirement.objects.order_by("title"):
            updates = {
                "title": normalize_text(requirement.title),
                "description": normalize_text(requirement.description),
                "rationale": normalize_text(requirement.rationale),
                "control_domain": normalize_text(requirement.control_domain),
            }
            changed_fields = [
                field
                for field, value in updates.items()
                if getattr(requirement, field) != value
            ]
            if not changed_fields:
                continue
            if not dry_run:
                for field in changed_fields:
                    setattr(requirement, field, updates[field])
                try:
                    requirement.save(update_fields=[*changed_fields, "updated_at"])
                except IntegrityError:
                    conflicts += 1
                    continue
            updated_requirements += 1

        suffix = " (simulacao)" if dry_run else ""
        self.stdout.write(self.style.SUCCESS(f"Normalizacao de evidencias concluida{suffix}."))
        self.stdout.write(f"Evidencias reutilizaveis atualizadas: {updated_items}")
        self.stdout.write(f"Tipos de evidencia esperada atualizados: {updated_requirements}")
        self.stdout.write(f"Conflitos ignorados: {conflicts}")
