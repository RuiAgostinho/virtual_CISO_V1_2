# Generated during local recovery on 2026-05-13

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("company", "0002_orgunit_person"),
    ]

    operations = [
        migrations.AddField(
            model_name="companyprofile",
            name="org_type",
            field=models.CharField(
                choices=[
                    ("Public", "Publica"),
                    ("Private", "Privada"),
                    ("ThirdSector", "Terceiro Setor"),
                ],
                default="Private",
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="geographic_scope",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="critical_services",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="mission",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="vision",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="strategic_objectives",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="security_objectives",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="annual_revenue",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="nis2_sector",
            field=models.CharField(default="none", max_length=100),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="nis2_subsector",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="is_critical_provider",
            field=models.BooleanField(default=False),
        ),
    ]
