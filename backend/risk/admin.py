from django.contrib import admin

from .models import (
    AssetClassificationReview,
    AssetDiscoveryFinding,
    AssetDiscoveryRun,
    AssetExposureSnapshot,
)


@admin.register(AssetDiscoveryRun)
class AssetDiscoveryRunAdmin(admin.ModelAdmin):
    list_display = ("source", "status", "started_at", "completed_at", "processed_count", "created_count")
    list_filter = ("source", "status", "started_at")
    search_fields = ("target_scope", "notes", "error_message")
    readonly_fields = ("started_at", "completed_at", "duration_seconds", "created_at", "updated_at")


@admin.register(AssetDiscoveryFinding)
class AssetDiscoveryFindingAdmin(admin.ModelAdmin):
    list_display = ("ip_address", "hostname", "status", "asset", "confidence_score", "created_at")
    list_filter = ("status", "run__source", "created_at")
    search_fields = ("ip_address", "hostname", "mac_address", "os_name", "asset__name")
    readonly_fields = ("created_at", "updated_at", "reviewed_at")


@admin.register(AssetExposureSnapshot)
class AssetExposureSnapshotAdmin(admin.ModelAdmin):
    list_display = ("asset", "source", "exposure_score", "captured_at")
    list_filter = ("source", "exposure_score", "captured_at")
    search_fields = ("asset__name", "asset__wazuh_ip", "exposure_label")
    readonly_fields = ("captured_at",)


@admin.register(AssetClassificationReview)
class AssetClassificationReviewAdmin(admin.ModelAdmin):
    list_display = ("asset", "status", "criticality_at_review", "classification_score", "is_current", "next_review_at")
    list_filter = ("status", "criticality_at_review", "is_current", "next_review_at")
    search_fields = ("asset__name", "rationale")
    readonly_fields = ("created_at", "updated_at", "reviewed_at", "snapshot")
