from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0036_alter_governanceaction_source_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="framework",
            name="code",
            field=models.CharField(
                choices=[
                    ("ISO27001", "ISO/IEC 27001"),
                    ("ISO27002", "ISO/IEC 27002"),
                    ("ISO27005", "ISO/IEC 27005"),
                    ("NISTCSF", "NIST CSF"),
                    ("NIS2", "NIS2"),
                    ("DL125", "DL 125/2025"),
                    ("QNRC", "QNRC"),
                ],
                max_length=20,
            ),
        ),
    ]
