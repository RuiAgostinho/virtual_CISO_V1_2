from django.db import migrations, models


def disable_flag_for_completed_onboarding(apps, schema_editor):
    CompanyProfile = apps.get_model("company", "CompanyProfile")
    CompanyProfile.objects.filter(onboarding_completed_at__isnull=False).update(
        institutional_onboarding_required=False
    )


class Migration(migrations.Migration):
    dependencies = [
        ("company", "0011_orgunit_critical_services_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="companyprofile",
            name="institutional_onboarding_required",
            field=models.BooleanField(default=True),
        ),
        migrations.RunPython(disable_flag_for_completed_onboarding, migrations.RunPython.noop),
    ]
