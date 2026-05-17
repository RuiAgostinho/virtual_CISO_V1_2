from rest_framework import serializers

from .models import CompanyProfile, OrgUnit, Person


class CompanyProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyProfile
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class OrgUnitSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True)
    manager_name = serializers.CharField(source="manager.name", read_only=True)
    unit_type_display = serializers.CharField(source="get_unit_type_display", read_only=True)
    people_count = serializers.IntegerField(source="people.count", read_only=True)

    class Meta:
        model = OrgUnit
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "parent_name",
            "manager_name",
            "unit_type_display",
            "people_count",
        )


class PersonSerializer(serializers.ModelSerializer):
    org_unit_name = serializers.CharField(source="org_unit.name", read_only=True)
    governance_role_display = serializers.CharField(source="get_governance_role_display", read_only=True)
    backup_for_name = serializers.CharField(source="backup_for.name", read_only=True)

    class Meta:
        model = Person
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "org_unit_name",
            "governance_role_display",
            "backup_for_name",
        )
