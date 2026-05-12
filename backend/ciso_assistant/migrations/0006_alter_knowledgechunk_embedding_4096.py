# Generated manually to align pgvector dimensions with OLLAMA_EMBED_MODEL=llama3.1:8b

import pgvector.django.vector
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ciso_assistant', '0005_rename_metadata_knowledgechunk_metadata_json_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='knowledgechunk',
            name='source_type',
            field=models.CharField(choices=[('policy', 'Policy'), ('asset', 'Asset'), ('vulnerability', 'Vulnerability'), ('control', 'Control'), ('mechanism', 'Mechanism'), ('evidence', 'Evidence'), ('general', 'General Knowledge')], max_length=50),
        ),
        migrations.AlterField(
            model_name='knowledgechunk',
            name='embedding',
            field=pgvector.django.vector.VectorField(blank=True, dimensions=4096, null=True),
        ),
    ]