from copy import deepcopy

from django.db import migrations


def _column_names(schema_editor, table_name):
    with schema_editor.connection.cursor() as cursor:
        return {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor, table_name
            )
        }


def repair_schema(apps, schema_editor):
    network_range = apps.get_model("risk", "NetworkRange")
    table_name = network_range._meta.db_table
    field = deepcopy(network_range._meta.get_field("last_scan_at"))

    if field.column not in _column_names(schema_editor, table_name):
        schema_editor.add_field(network_range, field)


class Migration(migrations.Migration):
    dependencies = [
        ("risk", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(repair_schema, migrations.RunPython.noop),
    ]
