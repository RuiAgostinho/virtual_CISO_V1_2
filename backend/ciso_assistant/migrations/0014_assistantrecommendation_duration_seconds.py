from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ciso_assistant", "0013_add_governance_action_source_choice"),
    ]

    operations = [
        migrations.AddField(
            model_name="assistantrecommendation",
            name="duration_seconds",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
