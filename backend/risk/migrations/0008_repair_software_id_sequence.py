from django.db import migrations


def repair_software_id_sequence(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT data_type, is_identity
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'risk_software'
              AND column_name = 'id'
            """
        )
        row = cursor.fetchone()
        if not row or row[0] not in {"bigint", "integer"}:
            return

        if row[1] == "YES":
            return

        cursor.execute("CREATE SEQUENCE IF NOT EXISTS risk_software_id_seq")
        cursor.execute(
            "ALTER TABLE risk_software ALTER COLUMN id SET DEFAULT nextval('risk_software_id_seq')"
        )
        cursor.execute("SELECT COALESCE(MAX(id), 0) FROM risk_software")
        max_id = cursor.fetchone()[0] or 0
        if max_id > 0:
            cursor.execute("SELECT setval('risk_software_id_seq', %s, true)", [max_id])
        else:
            cursor.execute("SELECT setval('risk_software_id_seq', 1, false)")


class Migration(migrations.Migration):
    dependencies = [
        ("risk", "0007_priority_model"),
    ]

    operations = [
        migrations.RunPython(repair_software_id_sequence, migrations.RunPython.noop),
    ]
