from rest_framework import serializers
from governance.models.decision import DecisionRecord

from .models import AssistantRecommendation



class ChatRequestSerializer(serializers.Serializer):

    query = serializers.CharField(max_length=2000, required=True, help_text="A pergunta do utilizador para o Virtual CISO")

    history = serializers.ListField(

        child=serializers.DictField(),

        required=False,

        default=list,

        help_text="Lista opcional do histórico de mensagens anteriores"

    )



class PolicyAdviceRequestSerializer(serializers.Serializer):

    policy_id = serializers.UUIDField(required=False, allow_null=True)

    advice_mode = serializers.ChoiceField(
        required=False,
        default="full_review",
        choices=[
            ("full_review", "Revisao completa"),
            ("coverage", "Cobertura de controlos internos"),
            ("auditability", "Auditabilidade e evidencia"),
            ("wording", "Redacao normativa"),
            ("draft_text", "Exemplo de redacao"),
        ],
    )

    policy_snapshot = serializers.DictField(required=True)


class ChatResponseSerializer(serializers.Serializer):

    task_type = serializers.CharField()

    model_used = serializers.CharField()

    used_rag = serializers.BooleanField()

    confidence = serializers.FloatField()

    duration_seconds = serializers.FloatField(required=False, allow_null=True)

    response = serializers.CharField()

    sources = serializers.ListField(child=serializers.DictField())


class AssistantRecommendationSerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()
    converted_decision_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = AssistantRecommendation
        fields = [
            "id",
            "question",
            "answer",
            "task_type",
            "model_used",
            "used_rag",
            "confidence",
            "duration_seconds",
            "sources_json",
            "history_json",
            "filters_json",
            "created_by",
            "created_by_label",
            "converted_decision_id",
            "created_at",
            "updated_at",
        ]

    def get_created_by(self, obj):
        if obj.created_by:
            return obj.created_by.get_username()
        return obj.created_by_label or None


class ConvertRecommendationSerializer(serializers.Serializer):
    decision_code = serializers.ChoiceField(choices=DecisionRecord.Decision.choices)
    justification = serializers.CharField(min_length=10, max_length=4000)
    title = serializers.CharField(required=False, allow_blank=True, max_length=255)
    responsible = serializers.CharField(required=False, allow_blank=True, max_length=255)
    due_date = serializers.DateField(required=False, allow_null=True)
    risk_impact = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    compliance_impact = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    evidence_reference = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    action_reference = serializers.CharField(required=False, allow_blank=True, max_length=4000)
