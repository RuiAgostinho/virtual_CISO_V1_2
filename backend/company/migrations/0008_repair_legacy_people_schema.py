from copy import deepcopy

from django.db import migrations


_MISSING = object()


def _column_names(schema_editor, table_name):
    with schema_editor.connection.cursor() as cursor:
        return {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor, table_name
            )
        }


def _add_field_if_missing(apps, schema_editor, model_name, field_name, default=_MISSING):
    model = apps.get_model("company", model_name)
    table_name = model._meta.db_table
    field = deepcopy(model._meta.get_field(field_name))

    if field.column in _column_names(schema_editor, table_name):
        return

    if default is not _MISSING:
        field.default = default

    schema_editor.add_field(model, field)


def _copy_legacy_person_values(apps, schema_editor):
    person = apps.get_model("company", "Person")
    org_unit = apps.get_model("company", "OrgUnit")
    qn = schema_editor.connection.ops.quote_name
    person_table = qn(person._meta.db_table)
    org_unit_table = qn(org_unit._meta.db_table)
    columns = _column_names(schema_editor, person._meta.db_table)

    if {"role", "role_type"}.issubset(columns):
        schema_editor.execute(
            f"""
            UPDATE {person_table}
               SET {qn("role")} = COALESCE(NULLIF({qn("role")}, ''), {qn("role_type")}, '')
            """
        )

    if {"org_unit_id", "department_id"}.issubset(columns):
        schema_editor.execute(
            f"""
            UPDATE {person_table}
               SET {qn("org_unit_id")} = {qn("department_id")}
             WHERE {qn("org_unit_id")} IS NULL
               AND {qn("department_id")} IS NOT NULL
               AND {qn("department_id")} IN (SELECT {qn("id")} FROM {org_unit_table})
            """
        )


def repair_schema(apps, schema_editor):
    _add_field_if_missing(apps, schema_editor, "OrgUnit", "parent")
    _add_field_if_missing(apps, schema_editor, "Person", "role", default="")
    _add_field_if_missing(apps, schema_editor, "Person", "org_unit")
    _copy_legacy_person_values(apps, schema_editor)


class Migration(migrations.Migration):
    dependencies = [
        ("company", "0007_companyprofile_onboarding"),
    ]

    operations = [
        migrations.RunPython(repair_schema, migrations.RunPython.noop),
    ]
