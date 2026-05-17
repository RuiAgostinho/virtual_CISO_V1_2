import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from pgvector.django import VectorField

class KnowledgeChunk(models.Model):
    """
    Stores textual knowledge chunks with pgvector embeddings for Semantic RAG.
    """
    
    title = models.CharField(max_length=255, blank=True)
    content = models.TextField(help_text="Full original text or context")
    chunk_text = models.TextField(default="", help_text="The exact chunk used for vectorization")
    
    SOURCE_CHOICES = [
        ('policy', 'Policy'),
        ('asset', 'Asset'),
        ('vulnerability', 'Vulnerability'),
        ('control', 'Control'),
        ('mechanism', 'Mechanism'),
        ('technical_regulation', 'Technical Regulation'),
        ('procedure', 'Procedure'),
        ('evidence', 'Evidence'),
        ('compliance_gap', 'Compliance Gap'),
        ('general', 'General Knowledge'),
    ]
    source_type = models.CharField(max_length=50, choices=SOURCE_CHOICES)
    source_ref = models.CharField(max_length=255, blank=True, help_text="Original source ID or URI")
    
    framework = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    control_code = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    
    metadata_json = models.JSONField(default=dict, blank=True)
    
    # Vector representation for the configured Ollama embedding model.
    # llama3.1:8b currently returns 4096-dimensional embeddings.
    embedding = VectorField(dimensions=4096, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['source_type']),
            models.Index(fields=['framework']),
            models.Index(fields=['control_code']),
        ]

    def __str__(self):
        return f"[{self.source_type}] {self.title or self.chunk_text[:50]}..."


class RagIngestionRun(models.Model):
    """
    Audit record for a bulk RAG re-ingestion triggered from the admin UI.

    One row is created per run; the background runner updates it as it
    progresses and on completion, so the UI can poll for live state.
    """

    class Mode(models.TextChoices):
        INCREMENTAL = "incremental", "Incremental"
        FULL = "full", "Completa"

    class Status(models.TextChoices):
        RUNNING = "running", "Em execução"
        SUCCESS = "success", "Concluída"
        FAILED = "failed", "Falhada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mode = models.CharField(max_length=20, choices=Mode.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)

    # SET_NULL keeps the audit row if the user account is later removed;
    # triggered_by_label snapshots the name so it survives that deletion.
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="rag_ingestion_runs",
    )
    triggered_by_label = models.CharField(max_length=255, blank=True)

    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)

    chunks_created = models.IntegerField(default=0)
    chunks_updated = models.IntegerField(default=0)
    chunks_removed = models.IntegerField(default=0)
    chunks_failed = models.IntegerField(default=0)
    total_processed = models.IntegerField(default=0)

    counts_by_type = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, help_text="Fatal error that aborted the run")
    error_detail = models.TextField(blank=True, help_text="Per-item indexing failures")

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["-started_at"]),
        ]

    def __str__(self):
        return f"RAG {self.mode} run @ {self.started_at:%Y-%m-%d %H:%M} [{self.status}]"


