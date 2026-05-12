from rest_framework import serializers

from .models import IntegrationConfig, IntegrationSyncStatus


class IntegrationConfigSerializer(serializers.ModelSerializer):
    provider_display = serializers.CharField(source="get_provider_display", read_only=True)

    class Meta:
        model = IntegrationConfig
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "provider_display")
        extra_kwargs = {
            "password": {"write_only": True, "required": False},
            "indexer_password": {"write_only": True, "required": False},
        }


class IntegrationSyncStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationSyncStatus
        fields = "__all__"
        read_only_fields = ("id", "last_run_at")
