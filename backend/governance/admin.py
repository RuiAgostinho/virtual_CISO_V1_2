from django.contrib import admin
from .models import DecisionRecord


@admin.register(DecisionRecord)
class DecisionRecordAdmin(admin.ModelAdmin):
    list_display = ("title", "decision_type", "decision", "target_type", "decided_by", "decided_at", "created_at")
    list_filter = ("decision_type", "decision", "target_type")
    search_fields = ("title", "recommendation", "rationale", "justification", "decided_by")
