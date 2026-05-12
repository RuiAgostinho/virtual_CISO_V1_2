# Generated manually to include compliance gap records in the RAG knowledge base.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ciso_assistant", "0007_expand_knowledgechunk_source_choices"),
    ]

    operations = [
        migrations.AlterField(
            model_name="knowledgechunk",
            name="source_type",
            field=models.CharField(
                choices=[
                    ("policy", "Policy"),
                    ("asset", "Asset"),
                    ("vulnerability", "Vulnerability"),
                    ("control", "Control"),
                    ("mechanism", "Mechanism"),
                    ("technical_regulation", "Technical Regulation"),
                    ("procedure", "Procedure"),
                    ("evidence", "Evidence"),
                    ("compliance_gap", "Compliance Gap"),
                    ("general", "General Knowledge"),
                ],
                max_length=50,
            ),
        ),
    ]