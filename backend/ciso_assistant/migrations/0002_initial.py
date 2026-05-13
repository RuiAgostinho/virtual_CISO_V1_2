import pgvector.django.vector
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ciso_assistant", "0001_pgvector_extension"),
    ]

    operations = [
        migrations.CreateModel(
            name="KnowledgeChunk",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(blank=True, max_length=255)),
                ("content", models.TextField(help_text="Full original text or context")),
                ("chunk_text", models.TextField(default="", help_text="The exact chunk used for vectorization")),
                (
                    "source_type",
                    models.CharField(
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
                ("source_ref", models.CharField(blank=True, help_text="Original source ID or URI", max_length=255)),
                ("framework", models.CharField(blank=True, db_index=True, max_length=100, null=True)),
                ("control_code", models.CharField(blank=True, db_index=True, max_length=100, null=True)),
                ("metadata_json", models.JSONField(blank=True, default=dict)),
                ("embedding", pgvector.django.vector.VectorField(blank=True, dimensions=4096, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
