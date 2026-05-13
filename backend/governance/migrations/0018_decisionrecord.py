import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0005_alter_control_section"),
    ]

    operations = [
        migrations.CreateModel(
            name="DecisionRecord",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("decision_type", models.CharField(choices=[("risk", "Risk"), ("vulnerability", "Vulnerability"), ("compliance_gap", "Compliance Gap"), ("assistant_recommendation", "Assistant Recommendation")], max_length=40)),
                ("target_type", models.CharField(max_length=100)),
                ("target_id", models.CharField(max_length=100)),
                ("title", models.CharField(max_length=255)),
                ("recommendation", models.TextField(blank=True)),
                ("rationale", models.TextField(blank=True)),
                ("source_snapshot", models.JSONField(blank=True, default=list)),
                ("score_snapshot", models.JSONField(blank=True, default=dict)),
                ("decision", models.CharField(choices=[("accepted", "Accepted"), ("rejected", "Rejected"), ("deferred", "Deferred"), ("converted_to_action", "Converted to Action")], default="deferred", max_length=30)),
                ("justification", models.TextField(blank=True)),
                ("decided_by", models.CharField(blank=True, max_length=150)),
                ("decided_at", models.DateTimeField(null=True, blank=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="decisionrecord",
            index=models.Index(fields=["decision_type", "decision"], name="ix_decision_type_status"),
        ),
        migrations.AddIndex(
            model_name="decisionrecord",
            index=models.Index(fields=["target_type", "target_id"], name="ix_decision_target"),
        ),
        migrations.AddIndex(
            model_name="decisionrecord",
            index=models.Index(fields=["decided_at"], name="ix_decision_decided_at"),
        ),
    ]
