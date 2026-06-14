from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from governance.models import Control, ControlAssessment, Framework, FrameworkProfile
from governance.services.security_posture_drift import SecurityPostureDriftService


class SecurityPostureDriftServiceTests(TestCase):
    def setUp(self):
        self.framework = Framework.objects.create(
            code=Framework.FrameworkCode.ISO27001,
            name="ISO/IEC 27001",
            version="2022",
        )
        self.profile = FrameworkProfile.objects.create(
            framework=self.framework,
            name=FrameworkProfile.ProfileType.BASELINE,
            max_level=5,
        )
        self.control = Control.objects.create(
            framework=self.framework,
            code="A.5.15",
            title="Controlo de acessos",
            description="Controlar acessos logicos.",
            is_mandatory=True,
        )
        self.assessment = ControlAssessment.objects.create(
            profile=self.profile,
            control=self.control,
            implementation_status=ControlAssessment.ImplementationStatus.IMPLEMENTED,
            maturity_level=4,
            effectiveness=Decimal("0.90"),
            risk_inherent=Decimal("0.80"),
            risk_residual=Decimal("0.20"),
            assessed_at=timezone.now(),
            assessed_by="tester",
        )

    def test_snapshot_then_status_regression_is_detected(self):
        SecurityPostureDriftService.create_current_snapshot(label="Auditoria anterior")
        self.assessment.implementation_status = ControlAssessment.ImplementationStatus.PARTIAL
        self.assessment.effectiveness = Decimal("0.40")
        self.assessment.risk_residual = Decimal("0.70")
        self.assessment.save()

        payload = SecurityPostureDriftService.overview()

        self.assertEqual(payload["metrics"]["control_regressions"], 1)
        regression = payload["control_regressions"][0]
        self.assertEqual(regression["control_code"], "A.5.15")
        self.assertEqual(regression["previous"]["implementation_status"], "implemented")
        self.assertEqual(regression["current"]["implementation_status"], "partial")

    def test_snapshot_then_control_improvement_is_detected_separately(self):
        self.assessment.implementation_status = ControlAssessment.ImplementationStatus.PARTIAL
        self.assessment.effectiveness = Decimal("0.40")
        self.assessment.risk_residual = Decimal("0.70")
        self.assessment.save()
        SecurityPostureDriftService.create_current_snapshot(label="Auditoria anterior")

        self.assessment.implementation_status = ControlAssessment.ImplementationStatus.OPTIMIZED
        self.assessment.effectiveness = Decimal("0.90")
        self.assessment.risk_residual = Decimal("0.20")
        self.assessment.save()

        payload = SecurityPostureDriftService.overview()

        self.assertEqual(payload["metrics"]["control_regressions"], 0)
        self.assertEqual(payload["metrics"]["control_improvements"], 1)
        self.assertEqual(payload["metrics"]["negative_events"], 0)
        self.assertEqual(payload["metrics"]["positive_events"], 1)
        improvement = payload["control_improvements"][0]
        self.assertEqual(improvement["type"], "control_improvement")
        self.assertEqual(improvement["previous"]["implementation_status"], "partial")
        self.assertEqual(improvement["current"]["implementation_status"], "optimized")

    def test_mixed_control_change_is_not_reported_as_improvement(self):
        SecurityPostureDriftService.create_current_snapshot(label="Auditoria anterior")
        self.assessment.implementation_status = ControlAssessment.ImplementationStatus.OPTIMIZED
        self.assessment.effectiveness = Decimal("0.95")
        self.assessment.risk_residual = Decimal("0.70")
        self.assessment.save()

        payload = SecurityPostureDriftService.overview()

        self.assertEqual(payload["metrics"]["control_regressions"], 1)
        self.assertEqual(payload["metrics"]["control_improvements"], 0)

    def test_without_snapshot_control_regression_is_not_inferred(self):
        self.assessment.implementation_status = ControlAssessment.ImplementationStatus.PARTIAL
        self.assessment.save()

        payload = SecurityPostureDriftService.overview()

        self.assertEqual(payload["metrics"]["control_regressions"], 0)
        self.assertEqual(payload["metrics"]["negative_events"], 0)
        self.assertEqual(payload["metrics"]["total_events"], 0)
        self.assertEqual(payload["metrics"]["framework_mapping_gaps"], 1)
