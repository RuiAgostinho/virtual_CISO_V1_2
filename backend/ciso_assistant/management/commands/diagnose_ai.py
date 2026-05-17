import requests
from django.conf import settings
from django.core.management.base import BaseCommand

from ciso_assistant.models import KnowledgeChunk
from ciso_assistant.services.chat.chat_service import ChatService
from ciso_assistant.services.llm_router import LLMRouter
from ciso_assistant.services.ollama_client import ollama_base_url
from ciso_assistant.services.retrieval.embedding_service import EmbeddingService


class Command(BaseCommand):
    help = "Diagnostica a componente de IA do Virtual CISO sem alterar dados."

    REQUIRED_MODELS = {"mistral:7b", "llama3.1:8b", "qwen2.5:7b-instruct"}

    def handle(self, *args, **options):
        warnings = []

        self.stdout.write(self.style.NOTICE("Diagnostico da IA do Virtual CISO"))
        ollama_url = ollama_base_url() or "http://127.0.0.1:11434"
        embed_model = getattr(settings, "OLLAMA_EMBED_MODEL", "llama3.2:3b")
        expected_dims = getattr(KnowledgeChunk._meta.get_field("embedding"), "dimensions", None)

        self.stdout.write(f"OLLAMA_URL: {ollama_url}")
        self.stdout.write(f"OLLAMA_EMBED_MODEL: {embed_model}")
        self.stdout.write(f"Dimensao esperada no pgvector: {expected_dims}")

        models = self._check_ollama(ollama_url, warnings)
        self._check_embeddings(expected_dims, warnings)
        self._check_knowledge_base(warnings)
        self._check_router()
        self._check_structured_path(warnings)

        if models:
            missing = sorted(self.REQUIRED_MODELS - set(models))
            if missing:
                warnings.append(f"Modelos Ollama em falta: {', '.join(missing)}")

        if warnings:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Avisos encontrados:"))
            for warning in warnings:
                self.stdout.write(self.style.WARNING(f"- {warning}"))
        else:
            self.stdout.write(self.style.SUCCESS("Sem avisos criticos detetados."))

    def _check_ollama(self, ollama_url, warnings):
        self.stdout.write("")
        self.stdout.write("1) Ollama")
        try:
            response = requests.get(f"{ollama_url}/api/tags", timeout=8)
            response.raise_for_status()
            models = [item.get("name") for item in response.json().get("models", []) if item.get("name")]
            self.stdout.write(self.style.SUCCESS(f"OK: {len(models)} modelos disponiveis: {', '.join(models)}"))
            return models
        except Exception as exc:
            warnings.append(f"Ollama inacessivel em {ollama_url}: {exc}")
            return []

    def _check_embeddings(self, expected_dims, warnings):
        self.stdout.write("")
        self.stdout.write("2) Embeddings")
        vector = EmbeddingService.get_embedding("diagnostico do Virtual CISO")
        if not vector:
            warnings.append("Nao foi possivel gerar embedding.")
            return

        self.stdout.write(f"Embedding recebido: {len(vector)} dimensoes")
        if expected_dims and len(vector) != expected_dims:
            warnings.append(f"Dimensao dos embeddings ({len(vector)}) difere do pgvector ({expected_dims}).")
        else:
            self.stdout.write(self.style.SUCCESS("OK: dimensao compativel com pgvector."))

    def _check_knowledge_base(self, warnings):
        self.stdout.write("")
        self.stdout.write("3) Base RAG")
        total = KnowledgeChunk.objects.count()
        embedded = KnowledgeChunk.objects.exclude(embedding__isnull=True).count()
        sources = list(KnowledgeChunk.objects.values_list("source_type", flat=True).order_by("source_type").distinct())
        self.stdout.write(f"KnowledgeChunk total: {total}")
        self.stdout.write(f"KnowledgeChunk com embedding: {embedded}")
        self.stdout.write(f"Tipos de fonte: {', '.join(sources) if sources else 'nenhum'}")
        if total == 0:
            warnings.append("Base RAG vazia. Execute manage.py ingest_knowledge depois das migracoes.")
        elif embedded == 0:
            warnings.append("Existem chunks, mas sem embeddings.")

    def _check_router(self):
        self.stdout.write("")
        self.stdout.write("4) Router")
        samples = [
            "Quantos ativos eu tenho?",
            "Quais os ativos com IP?",
            "Prioriza as vulnerabilidades mais urgentes",
            "Que controlos ISO mitigam acessos?",
            "Escreve uma evidencia de auditoria",
            "No meu SGSI tenho alguma politica ativa?",
            "Qual e o score de conformidade por framework?",
            "Onde estou pior na ISO?",
        ]
        for query in samples:
            normalized = LLMRouter.normalize_text(query)
            decision = LLMRouter.detect_task_type(query)
            self.stdout.write(
                f"- {query} -> {decision['task_type']} "
                f"({decision['decision_source']}, rag={decision['needs_rag']}, model={decision['model_used']}, norm={normalized})"
            )

    def _check_structured_path(self, warnings):
        self.stdout.write("")
        self.stdout.write("5) Consulta estruturada")
        result = ChatService.ask_ciso("Quantos ativos eu tenho?")
        response = result.get("response", "")
        self.stdout.write(f"Resposta ativos: {response}")
        if result.get("model_used") != "django_orm":
            warnings.append("Consulta estruturada nao usou o bypass Django ORM.")

        compliance_result = ChatService.ask_ciso("Qual e o score de conformidade por framework?")
        compliance_response = compliance_result.get("response", "")
        self.stdout.write(f"Resposta conformidade: {compliance_response[:250]}")
        if compliance_result.get("model_used") != "django_orm":
            warnings.append("Consulta de score de conformidade nao usou o bypass Django ORM.")
