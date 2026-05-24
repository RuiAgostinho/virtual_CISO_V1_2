from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0032_governanceaction"),
    ]

    operations = [
        migrations.AddField(
            model_name="governanceaction",
            name="estimated_effort_hours",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=7, null=True),
        ),
        migrations.AddField(
            model_name="governanceaction",
            name="required_roles",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="governanceaction",
            name="required_materials",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="governanceaction",
            name="evidence_required",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="governanceaction",
            name="expected_evidence",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="governanceaction",
            name="ai_generated",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="governanceaction",
            name="ai_rationale",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="governanceaction",
            name="dependency_notes",
            field=models.TextField(blank=True),
        ),
    ]
