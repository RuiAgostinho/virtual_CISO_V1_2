from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ciso_assistant", "0012_expand_knowledgechunk_governance_sources"),
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
                    ("internal_control", "Internal Control"),
                    ("governance_document", "Governance Document"),
                    ("governance_section", "Governance Document Section"),
                    ("evidence_item", "Evidence Item"),
                    ("framework_mapping", "Internal Control Framework Mapping"),
                    ("internal_control_mechanism", "Internal Control Mechanism"),
                    ("governance_action", "Governance Action"),
                    ("general", "General Knowledge"),
                ],
                max_length=50,
            ),
        ),
    ]
