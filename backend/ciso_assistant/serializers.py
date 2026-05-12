from rest_framework import serializers



class ChatRequestSerializer(serializers.Serializer):

    query = serializers.CharField(max_length=2000, required=True, help_text="A pergunta do utilizador para o Virtual CISO")

    history = serializers.ListField(

        child=serializers.DictField(),

        required=False,

        default=list,

        help_text="Lista opcional do histÃ³rico de mensagens anteriores"

    )



class ChatResponseSerializer(serializers.Serializer):

    task_type = serializers.CharField()

    model_used = serializers.CharField()

    used_rag = serializers.BooleanField()

    confidence = serializers.FloatField()

    response = serializers.CharField()

    sources = serializers.ListField(child=serializers.DictField())



