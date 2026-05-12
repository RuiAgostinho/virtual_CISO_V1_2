import uuid
from django.db import models
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


