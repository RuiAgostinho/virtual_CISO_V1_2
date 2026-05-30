from rest_framework import serializers

from .models.asset import Asset, AssetHistory, AssetCategory, AssetType, RiskConfiguration

from .models.discovery import (
    AssetClassificationReview,
    AssetDiscoveryFinding,
    AssetDiscoveryRun,
    AssetExposureSnapshot,
)

from .models.software import Software, SoftwareHistory

from .models.vulnerability import Vulnerability, AssetVulnerability, VulnerabilityHistory

from .models.risk import Risk, RiskFactor, RiskAssessment, RiskTreatment

from .models.network_range import NetworkRange

from .models.asset_lookups import AssetLocation, AssetEnvironment, AssetInfrastructure

from governance.serializers import ControlSerializer

from company.serializers import PersonSerializer, OrgUnitSerializer





class RiskConfigurationSerializer(serializers.ModelSerializer):

    class Meta:

        model = RiskConfiguration

        fields = '__all__'



# --- Tiny Serializers for Pruning ---



class AssetTinySerializer(serializers.ModelSerializer):

    category_name = serializers.CharField(source='category.name', read_only=True)

    type_name = serializers.CharField(source='asset_type.name', read_only=True)



    class Meta:

        model = Asset

        fields = ['id', 'name', 'asset_type', 'type_name', 'category_name', 'wazuh_ip', 'wazuh_agent_id']



class AssetLocationSerializer(serializers.ModelSerializer):

    class Meta:

        model = AssetLocation

        fields = '__all__'



class AssetEnvironmentSerializer(serializers.ModelSerializer):

    class Meta:

        model = AssetEnvironment

        fields = '__all__'



class AssetInfrastructureSerializer(serializers.ModelSerializer):

    class Meta:

        model = AssetInfrastructure

        fields = '__all__'



class SoftwareTinySerializer(serializers.ModelSerializer):

    class Meta:

        model = Software

        fields = ['name', 'version', 'vendor']



# --- Lookups & Base Serializers ---



class AssetCategorySerializer(serializers.ModelSerializer):

    class Meta:

        model = AssetCategory

        fields = '__all__'



class AssetTypeSerializer(serializers.ModelSerializer):

    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:

        model = AssetType

        fields = '__all__'



class AssetHistorySerializer(serializers.ModelSerializer):

    class Meta:

        model = AssetHistory

        fields = '__all__'



class AssetDiscoveryRunSerializer(serializers.ModelSerializer):

    findings_count = serializers.IntegerField(source='findings.count', read_only=True)

    class Meta:

        model = AssetDiscoveryRun

        fields = '__all__'

        read_only_fields = (
            'started_by', 'started_at', 'completed_at', 'duration_seconds',
            'processed_count', 'created_count', 'updated_count',
            'confirmed_count', 'ignored_count', 'duplicate_count',
            'raw_summary', 'created_at', 'updated_at', 'findings_count'
        )



class AssetDiscoveryFindingSerializer(serializers.ModelSerializer):

    asset_name = serializers.CharField(source='asset.name', read_only=True)

    run_source = serializers.CharField(source='run.source', read_only=True)

    run_started_at = serializers.DateTimeField(source='run.started_at', read_only=True)

    class Meta:

        model = AssetDiscoveryFinding

        fields = '__all__'

        read_only_fields = ('reviewed_by', 'reviewed_at', 'created_at', 'updated_at')



class AssetExposureSnapshotSerializer(serializers.ModelSerializer):

    asset_name = serializers.CharField(source='asset.name', read_only=True)

    discovery_run_source = serializers.CharField(source='discovery_run.source', read_only=True)

    class Meta:

        model = AssetExposureSnapshot

        fields = '__all__'



class AssetClassificationReviewSerializer(serializers.ModelSerializer):

    asset_name = serializers.CharField(source='asset.name', read_only=True)

    reviewed_by_name = serializers.CharField(source='reviewed_by.username', read_only=True)

    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:

        model = AssetClassificationReview

        fields = '__all__'

        read_only_fields = (
            'created_by', 'reviewed_by', 'reviewed_at', 'snapshot',
            'created_at', 'updated_at'
        )

    def validate(self, attrs):
        for field in (
            'confidentiality',
            'integrity',
            'availability',
            'exposure',
            'business_value',
            'dependency_score',
        ):
            value = attrs.get(field, getattr(self.instance, field, 3))
            try:
                numeric_value = int(value)
            except (TypeError, ValueError):
                raise serializers.ValidationError({field: 'O valor deve estar entre 1 e 5.'})
            if value is not None and (numeric_value < 1 or numeric_value > 5):
                raise serializers.ValidationError({field: 'O valor deve estar entre 1 e 5.'})
        return attrs



# --- Main Serializers ---



class SoftwareListSerializer(serializers.ModelSerializer):

    assets_count = serializers.IntegerField(source='assets_count_anno', read_only=True)

    vulnerabilities_count = serializers.IntegerField(source='vulnerabilities_count_anno', read_only=True)

    max_severity = serializers.CharField(source='max_severity_anno', read_only=True)

    risk_score = serializers.DecimalField(source='risk_score_anno', max_digits=4, decimal_places=1, read_only=True)



    class Meta:

        model = Software

        fields = (

            'id', 'name', 'version', 'architecture', 'vendor', 

            'source', 'assets_count', 'vulnerabilities_count', 

            'max_severity', 'risk_score'

        )

        read_only_fields = ('assets_count', 'vulnerabilities_count', 'max_severity', 'risk_score')



class SoftwareHistorySerializer(serializers.ModelSerializer):

    class Meta:

        model = SoftwareHistory

        fields = '__all__'



class SoftwareDetailSerializer(serializers.ModelSerializer):

    assets_count = serializers.IntegerField(source='assets_count_anno', read_only=True)

    vulnerabilities_count = serializers.IntegerField(source='vulnerabilities_count_anno', read_only=True)

    risk_score = serializers.DecimalField(source='risk_score_anno', max_digits=4, decimal_places=1, read_only=True)

    assets_detail = AssetTinySerializer(source='assets', many=True, read_only=True)

    vulnerabilities_detail = serializers.SerializerMethodField()

    

    # Parity details

    category_details = AssetCategorySerializer(source='category', read_only=True)

    type_details = AssetTypeSerializer(source='asset_type', read_only=True)

    business_owner_details = PersonSerializer(source='business_owner', read_only=True)

    technical_owner_details = PersonSerializer(source='technical_owner', read_only=True)

    org_unit_details = OrgUnitSerializer(source='org_unit', read_only=True)

    location_details = AssetLocationSerializer(source='location', read_only=True)

    environment_details = AssetEnvironmentSerializer(source='environment', read_only=True)

    deployment_type_details = AssetInfrastructureSerializer(source='deployment_type', read_only=True)

    

    # Dependency details

    dependent_assets_details = AssetTinySerializer(source='dependent_assets', many=True, read_only=True)

    external_service_assets_details = AssetTinySerializer(source='external_service_assets', many=True, read_only=True)

    integration_assets_details = AssetTinySerializer(source='integration_assets', many=True, read_only=True)

    

    history = SoftwareHistorySerializer(many=True, read_only=True)



    class Meta:

        model = Software

        fields = [

            'id', 'name', 'version', 'architecture', 'vendor', 'description', 

            'category', 'asset_type', 'location', 'environment', 'deployment_type',

            'business_owner', 'technical_owner', 'org_unit',

            'criticality', 'confidentiality', 'integrity', 'availability', 'exposure',

            'business_value', 'dependency_score', 'status', 'end_of_life', 'source', 'unique_identifier',

            'assets', 'dependent_assets', 'external_service_assets', 'integration_assets',

            'assets_count', 'vulnerabilities_count', 'risk_score', 'assets_detail', 'vulnerabilities_detail',

            'category_details', 'type_details', 'business_owner_details', 'technical_owner_details',

            'org_unit_details', 'location_details', 'environment_details', 'deployment_type_details',

            'dependent_assets_details', 'external_service_assets_details', 'integration_assets_details',

            'history'

        ]

        read_only_fields = ('created_at', 'updated_at', 'assets_count', 'vulnerabilities_count', 'risk_score')



    def get_vulnerabilities_detail(self, obj):

        # Return a list of unique vulnerabilities related to this software

        # Using a cleaner join to avoid database-specific DISTINCT ON issues

        from .models.vulnerability import Vulnerability

        vulnerabilities = Vulnerability.objects.filter(occurrences__software=obj).distinct()

        return [{

            'id': v.id,

            'cve_id': v.cve_id,

            'severity': v.severity,

            'cvss_score': v.cvss_score

        } for v in vulnerabilities]





# --- Vulnerability Definition (Dictionary) ---



class VulnerabilitySerializer(serializers.ModelSerializer):

    controls = ControlSerializer(many=True, read_only=True)

    affected_assets_count = serializers.IntegerField(read_only=True)

    open_assets_count = serializers.IntegerField(read_only=True)

    

    class Meta:

        model = Vulnerability

        fields = '__all__'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        from .services.intel_service import IntelService

        data.update(IntelService.serialize_quality_flags(instance))
        return data



# --- Asset Vulnerability (Occurrence) ---



class VulnerabilityHistorySerializer(serializers.ModelSerializer):

    class Meta:

        model = VulnerabilityHistory

        fields = '__all__'



class AssetVulnerabilitySerializer(serializers.ModelSerializer):

    vulnerability_details = VulnerabilitySerializer(source='vulnerability', read_only=True)

    asset_details = AssetTinySerializer(source='asset', read_only=True)

    software_details = SoftwareTinySerializer(source='software', read_only=True)

    history = VulnerabilityHistorySerializer(many=True, read_only=True)



    class Meta:

        model = AssetVulnerability

        fields = '__all__'

        read_only_fields = ('first_detected', 'last_seen', 'resolved_at')



class AssetVulnerabilityListSerializer(serializers.ModelSerializer):

    cve_id = serializers.CharField(source='vulnerability.cve_id', read_only=True)

    severity = serializers.CharField(source='vulnerability.severity', read_only=True)

    cvss_score = serializers.DecimalField(source='vulnerability.cvss_score', max_digits=4, decimal_places=1, read_only=True)

    cvss_exploitability_score = serializers.DecimalField(source='vulnerability.cvss_exploitability_score', max_digits=5, decimal_places=4, read_only=True)

    epss_score = serializers.DecimalField(source='vulnerability.epss_score', max_digits=5, decimal_places=4, read_only=True)

    asset_name = serializers.CharField(source='asset.name', read_only=True)

    software_name = serializers.CharField(source='software.name', read_only=True)



    class Meta:

        model = AssetVulnerability

        fields = [

            'id', 'asset', 'asset_name', 'vulnerability', 'cve_id', 

            'severity', 'cvss_score', 'cvss_exploitability_score', 'epss_score', 'status', 

            'software_name', 'software_version',

            'first_detected', 'last_seen', 'source'

        ]



# --- Assets & Risks ---



class AssetSerializer(serializers.ModelSerializer):

    controls_count = serializers.IntegerField(source='controls.count', read_only=True)

    vulnerabilities_count = serializers.IntegerField(source='vulnerability_occurrences.count', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    type_name = serializers.CharField(source='asset_type.name', read_only=True)
    business_owner_name = serializers.CharField(source='business_owner.name', read_only=True)
    technical_owner_name = serializers.CharField(source='technical_owner.name', read_only=True)
    org_unit_name = serializers.CharField(source='org_unit.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    environment_name = serializers.CharField(source='environment.name', read_only=True)
    deployment_type_name = serializers.CharField(source='deployment_type.name', read_only=True)

    vulnerability_occurrences = AssetVulnerabilityListSerializer(many=True, read_only=True)

    installed_software = SoftwareTinySerializer(many=True, read_only=True)

    history = AssetHistorySerializer(many=True, read_only=True)

    parent_details = AssetTinySerializer(source='parent', read_only=True)

    children_details = AssetTinySerializer(source='dependencies', many=True, read_only=True)

    category_details = AssetCategorySerializer(source='category', read_only=True)

    business_owner_details = PersonSerializer(source='business_owner', read_only=True)

    technical_owner_details = PersonSerializer(source='technical_owner', read_only=True)

    org_unit_details = OrgUnitSerializer(source='org_unit', read_only=True)

    type_details = AssetTypeSerializer(source='asset_type', read_only=True)

    location_details = AssetLocationSerializer(source='location', read_only=True)

    environment_details = AssetEnvironmentSerializer(source='environment', read_only=True)

    deployment_type_details = AssetInfrastructureSerializer(source='deployment_type', read_only=True)

    dependent_assets_details = AssetTinySerializer(source='dependent_assets', many=True, read_only=True)

    external_service_assets_details = AssetTinySerializer(source='external_service_assets', many=True, read_only=True)

    integration_assets_details = AssetTinySerializer(source='integration_assets', many=True, read_only=True)

    depends_on_software_details = SoftwareTinySerializer(source='depends_on_software', many=True, read_only=True)

    criticality_breakdown = serializers.SerializerMethodField()

    current_classification_review = serializers.SerializerMethodField()

    latest_exposure_snapshot = serializers.SerializerMethodField()

    def get_criticality_breakdown(self, obj):
        return obj.criticality_breakdown()

    def get_current_classification_review(self, obj):
        review = obj.classification_reviews.filter(is_current=True).order_by('-created_at').first()
        return AssetClassificationReviewSerializer(review).data if review else None

    def get_latest_exposure_snapshot(self, obj):
        snapshot = obj.exposure_snapshots.order_by('-captured_at').first()
        return AssetExposureSnapshotSerializer(snapshot).data if snapshot else None

    class Meta:

        model = Asset

        fields = [

            'id', 'name', 'description', 'supported_service', 'business_process',
            'category', 'asset_type', 'org_unit', 'location', 

            'environment', 'deployment_type', 'business_owner', 'technical_owner', 
            'category_name', 'type_name',
            'business_owner_name', 'technical_owner_name', 'org_unit_name',
            'location_name', 'environment_name', 'deployment_type_name',

            'criticality', 'confidentiality', 'integrity', 'availability', 'exposure', 

            'business_value', 'dependency_score', 'status', 'source', 'unique_identifier',

            'wazuh_agent_id', 'wazuh_ip', 'secondary_ips', 'last_sync_at', 'created_at', 'updated_at',

            'parent', 'dependencies', 'dependent_assets', 'external_service_assets', 'integration_assets',

            'controls_count', 'vulnerabilities_count', 'vulnerability_occurrences', 'installed_software',

            'history', 'parent_details', 'children_details', 'category_details', 'type_details',

            'business_owner_details', 'technical_owner_details', 'org_unit_details', 
            'location_details', 'environment_details', 'deployment_type_details',

            'dependent_assets_details', 'external_service_assets_details', 'integration_assets_details',

            'depends_on_software_details', 'criticality_breakdown',

            'current_classification_review', 'latest_exposure_snapshot'

        ]

        read_only_fields = (

            'created_at', 'updated_at', 'controls_count', 'dependencies', 

            'vulnerabilities_count', 'last_sync_at', 

            'wazuh_hardware', 'wazuh_packages', 'history',

            'category_details', 'type_details'

        )



class AssetListSerializer(serializers.ModelSerializer):

    vulnerabilities_count = serializers.IntegerField(source='vulnerabilities_count_anno', read_only=True)

    controls_count = serializers.IntegerField(source='controls_count_anno', read_only=True)

    category_name = serializers.CharField(source='category.name', read_only=True)

    type_name = serializers.CharField(source='asset_type.name', read_only=True)

    business_owner_name = serializers.CharField(source='business_owner.name', read_only=True)

    technical_owner_name = serializers.CharField(source='technical_owner.name', read_only=True)

    org_unit_name = serializers.CharField(source='org_unit.name', read_only=True)

    location_name = serializers.CharField(source='location.name', read_only=True)

    environment_name = serializers.CharField(source='environment.name', read_only=True)

    classification_status = serializers.SerializerMethodField()

    classification_review_due = serializers.SerializerMethodField()

    latest_exposure_score = serializers.SerializerMethodField()

    latest_exposure_at = serializers.SerializerMethodField()

    def get_classification_status(self, obj):
        review = obj.classification_reviews.filter(is_current=True).order_by('-created_at').first()
        return review.status if review else 'not_validated'

    def get_classification_review_due(self, obj):
        review = obj.classification_reviews.filter(is_current=True).order_by('-created_at').first()
        return review.next_review_at if review else None

    def get_latest_exposure_score(self, obj):
        snapshot = obj.exposure_snapshots.order_by('-captured_at').first()
        return snapshot.exposure_score if snapshot else None

    def get_latest_exposure_at(self, obj):
        snapshot = obj.exposure_snapshots.order_by('-captured_at').first()
        return snapshot.captured_at if snapshot else None



    class Meta:

        model = Asset

        fields = [

            'id', 'name', 'asset_type', 'type_name', 'category', 'category_name', 

            'business_owner', 'business_owner_name', 

            'technical_owner', 'technical_owner_name',

            'org_unit', 'org_unit_name',

            'location', 'location_name',

            'environment', 'environment_name',

            'owner', 'criticality', 'confidentiality', 'integrity', 'availability', 'exposure',

            'business_value', 'dependency_score',

            'status', 'source', 'last_sync_at', 'wazuh_ip', 'secondary_ips', 'parent',

            'vulnerabilities_count', 'controls_count',

            'classification_status', 'classification_review_due',

            'latest_exposure_score', 'latest_exposure_at'

        ]







class RiskFactorSerializer(serializers.ModelSerializer):

    class Meta:

        model = RiskFactor

        fields = '__all__'



class RiskTreatmentSerializer(serializers.ModelSerializer):

    treatment_type_display = serializers.CharField(source='get_treatment_type_display', read_only=True)

    status_display = serializers.CharField(source='get_status_display', read_only=True)

    

    class Meta:

        model = RiskTreatment

        fields = '__all__'



class RiskSerializer(serializers.ModelSerializer):

    asset_name = serializers.CharField(source='asset.name', read_only=True)

    vulnerability_cve = serializers.CharField(source='vulnerability.cve_id', read_only=True)

    vulnerability_title = serializers.CharField(source='vulnerability.title', read_only=True)

    factors = RiskFactorSerializer(many=True, read_only=True)

    treatments = RiskTreatmentSerializer(many=True, read_only=True)

    risk_level_display = serializers.CharField(source='get_risk_level_display', read_only=True)

    status_display = serializers.CharField(source='get_status_display', read_only=True)

    

    asset_criticality = serializers.CharField(source='asset.criticality', read_only=True)

    vulnerability_cvss = serializers.DecimalField(source='vulnerability.cvss_score', max_digits=4, decimal_places=1, read_only=True)



    class Meta:

        model = Risk

        fields = '__all__'

        read_only_fields = ('created_at', 'updated_at', 'risk_score', 'asset_name', 'vulnerability_cve')



class RiskAssessmentSerializer(serializers.ModelSerializer):

    asset_name = serializers.CharField(source='asset.name', read_only=True)

    overall_level_display = serializers.CharField(source='get_overall_level_display', read_only=True)

    

    class Meta:

        model = RiskAssessment

        fields = '__all__'



class NetworkRangeSerializer(serializers.ModelSerializer):

    class Meta:

        model = NetworkRange

        fields = '__all__'



