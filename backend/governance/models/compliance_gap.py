import uuid
from django.db import models
from .framework import Framework
from .control import Control

class ComplianceGap(models.Model):
    STATUS_CHOICES = (
        ('MISSING', 'Missing'),
        ('PARTIAL', 'Partial'),
        ('IMPLEMENTED', 'Implemented'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name='compliance_gaps')
    framework = models.ForeignKey(Framework, on_delete=models.CASCADE, related_name='compliance_gaps')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='MISSING')
    confidence_score = models.FloatField(null=True, blank=True)
    evidence_count = models.IntegerField(default=0)
    
    last_evaluated = models.DateTimeField(auto_now=True)
    notes = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['framework', 'status']),
            models.Index(fields=['control']),
        ]
        unique_together = ('control', 'framework')
        ordering = ['-last_evaluated']

    def __str__(self):
        return f"[{self.status}] {self.control.control_id} in {self.framework.name}"


