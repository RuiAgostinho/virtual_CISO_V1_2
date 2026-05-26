import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from .asset import Asset


class AssetDiscoveryRun(models.Model):
    class Source(models.TextChoices):
        NMAP = "nmap", "Nmap"
        WAZUH = "wazuh", "Wazuh"
        MANUAL = "manual", "Manual"
        IMPORT = "import", "Import"

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        PARTIAL = "partial", "Partial"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.NMAP, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED, db_index=True)
    target_scope = models.CharField(max_length=255, blank=True)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="asset_discovery_runs",
    )
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    processed_count = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    confirmed_count = models.PositiveIntegerField(default=0)
    ignored_count = models.PositiveIntegerField(default=0)
    duplicate_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    raw_summary = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["source", "status"], name="ix_asset_run_source_status"),
            models.Index(fields=["started_at"], name="ix_asset_run_started_at"),
        ]

    def finish(self, status=None, error_message=""):
        self.status = status or self.Status.COMPLETED
        self.completed_at = timezone.now()
        self.duration_seconds = int((self.completed_at - self.started_at).total_seconds())
        if error_message:
            self.error_message = error_message
        self.save(update_fields=[
            "status",
            "completed_at",
            "duration_seconds",
            "processed_count",
            "created_count",
            "updated_count",
            "confirmed_count",
            "ignored_count",
            "duplicate_count",
            "error_message",
            "raw_summary",
            "updated_at",
        ])

    def __str__(self):
        return f"{self.source} discovery {self.started_at:%Y-%m-%d %H:%M}"


class AssetDiscoveryFinding(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "New"
        IN_REVIEW = "in_review", "In review"
        CONFIRMED = "confirmed", "Confirmed"
        IGNORED = "ignored", "Ignored"
        DUPLICATE = "duplicate", "Duplicate"
        MERGED = "merged", "Merged"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(AssetDiscoveryRun, on_delete=models.CASCADE, related_name="findings")
    asset = models.ForeignKey(Asset, null=True, blank=True, on_delete=models.SET_NULL, related_name="discovery_findings")
    ip_address = models.CharField(max_length=255, blank=True, db_index=True)
    hostname = models.CharField(max_length=255, blank=True, db_index=True)
    mac_address = models.CharField(max_length=255, blank=True, db_index=True)
    os_name = models.CharField(max_length=255, blank=True)
    open_ports = models.JSONField(default=list, blank=True)
    services = models.JSONField(default=list, blank=True)
    vulnerabilities = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    confidence_score = models.DecimalField(max_digits=5, decimal_places=2, default=50)
    match_reason = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_asset_discovery_findings",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "-created_at"]
        indexes = [
            models.Index(fields=["status"], name="ix_asset_finding_status"),
            models.Index(fields=["ip_address"], name="ix_asset_finding_ip"),
            models.Index(fields=["hostname"], name="ix_asset_finding_host"),
        ]

    @property
    def has_asset(self):
        return self.asset_id is not None

    def mark_reviewed(self, status, user=None):
        self.status = status
        self.reviewed_at = timezone.now()
        if user and getattr(user, "is_authenticated", False):
            self.reviewed_by = user

    def __str__(self):
        return self.hostname or self.ip_address or str(self.id)


class AssetExposureSnapshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="exposure_snapshots")
    discovery_run = models.ForeignKey(
        AssetDiscoveryRun,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="exposure_snapshots",
    )
    captured_at = models.DateTimeField(default=timezone.now, db_index=True)
    source = models.CharField(max_length=30, default="nmap", db_index=True)
    exposure_score = models.PositiveSmallIntegerField(default=3)
    exposure_label = models.CharField(max_length=100, blank=True)
    open_ports = models.JSONField(default=list, blank=True)
    services = models.JSONField(default=list, blank=True)
    vulnerabilities_summary = models.JSONField(default=dict, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-captured_at"]
        indexes = [
            models.Index(fields=["asset", "captured_at"], name="ix_asset_exposure_asset_time"),
            models.Index(fields=["source"], name="ix_asset_exposure_source"),
        ]

    def __str__(self):
        return f"{self.asset} exposure {self.captured_at:%Y-%m-%d %H:%M}"


class AssetClassificationReview(models.Model):
    class Status(models.TextChoices):
        INCOMPLETE = "incomplete", "Incomplete"
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        VALIDATED = "validated", "Validated"
        EXPIRED = "expired", "Expired"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="classification_reviews")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INCOMPLETE, db_index=True)
    classification_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    criticality_at_review = models.CharField(max_length=50, blank=True)
    confidentiality = models.PositiveSmallIntegerField(default=3)
    integrity = models.PositiveSmallIntegerField(default=3)
    availability = models.PositiveSmallIntegerField(default=3)
    exposure = models.PositiveSmallIntegerField(default=3)
    business_value = models.PositiveSmallIntegerField(default=3)
    dependency_score = models.PositiveSmallIntegerField(default=3)
    rationale = models.TextField(blank=True)
    is_current = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_asset_classification_reviews",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_asset_classification_reviews",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    next_review_at = models.DateField(null=True, blank=True)
    snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_current", "-created_at"]
        indexes = [
            models.Index(fields=["asset", "is_current"], name="ix_asset_class_current"),
            models.Index(fields=["status"], name="ix_asset_class_status"),
            models.Index(fields=["next_review_at"], name="ix_asset_class_next_review"),
        ]

    @classmethod
    def build_snapshot(cls, asset):
        return {
            "asset_id": str(asset.id),
            "asset_name": asset.name,
            "criticality_breakdown": asset.criticality_breakdown(),
            "owner": asset.owner,
            "business_owner": getattr(asset.business_owner, "name", None),
            "technical_owner": getattr(asset.technical_owner, "name", None),
        }

    @classmethod
    def from_asset(cls, asset, **kwargs):
        breakdown = asset.criticality_breakdown()
        return cls(
            asset=asset,
            classification_score=breakdown["score"],
            criticality_at_review=breakdown["level"],
            confidentiality=asset.confidentiality,
            integrity=asset.integrity,
            availability=asset.availability,
            exposure=asset.exposure,
            business_value=asset.business_value,
            dependency_score=asset.dependency_score,
            snapshot=cls.build_snapshot(asset),
            **kwargs,
        )

    def validate_review(self, user=None):
        self.status = self.Status.VALIDATED
        self.reviewed_at = timezone.now()
        if user and getattr(user, "is_authenticated", False):
            self.reviewed_by = user

    def __str__(self):
        return f"{self.asset} classification {self.status}"
