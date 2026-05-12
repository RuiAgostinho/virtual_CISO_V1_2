from rest_framework import serializers

from .models import CompanyProfile, OrgUnit, Person


class CompanyProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyProfile
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class OrgUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrgUnit
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class PersonSerializer(serializers.ModelSerializer):
    org_unit_name = serializers.CharField(source="org_unit.name", read_only=True)

    class Meta:
        model = Person
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "org_unit_name")
