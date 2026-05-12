# Generated manually to expand RAG source coverage for SGSI/GRC records.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ciso_assistant', '0006_alter_knowledgechunk_embedding_4096'),
    ]

    operations = [
        migrations.AlterField(
            model_name='knowledgechunk',
            name='source_type',
            field=models.CharField(
                choices=[
                    ('policy', 'Policy'),
                    ('asset', 'Asset'),
                    ('vulnerability', 'Vulnerability'),
                    ('control', 'Control'),
                    ('mechanism', 'Mechanism'),
                    ('technical_regulation', 'Technical Regulation'),
                    ('procedure', 'Procedure'),
                    ('evidence', 'Evidence'),
                    ('general', 'General Knowledge'),
                ],
                max_length=50,
            ),
        ),
    ]