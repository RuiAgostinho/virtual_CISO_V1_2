from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q
from django.utils import timezone

from governance.models import (
    CompliancePropagationResult,
    Control,
    EvidenceItem,
    EvidenceLink,
    Framework,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceException,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
)


class CompliancePropagationEngine:
    """Calculate compliance from reusable evidence up to frameworks.

    Formula summary:
    - Mechanism score comes from the InternalControlMechanism implementation
      status when a control context is provided.
    - Valid reusable evidence only raises a contextual mechanism to 100 when
      the link is explicitly marked as implemented_evidenced.
    - InternalControl score is the weighted average of linked mechanisms.
    - Policy and GovernanceDocument scores are averages of linked controls.
    - FrameworkControl score is the coverage-weighted average of mapped
      InternalControls.
    - Framework score is the average of assessed FrameworkControls plus an
      explicit coverage percentage, so missing mappings are visible.
    """

    OFFICIAL = CompliancePropagationResult.CalculationMode.OFFICIAL
    SIMULATION = CompliancePropagationResult.CalculationMode.SIMULATION
    EXPLORATORY = CompliancePropagationResult.CalculationMode.EXPLORATORY

    VALID_EVIDENCE_LINK_TYPES = [
        EvidenceLink.LinkType.EVIDENCES,
        EvidenceLink.LinkType.SUPPORTS,
        EvidenceLink.LinkType.VALIDATES,
        EvidenceLink.LinkType.DEMONSTRATES,
    ]

    IMPLEMENTATION_SCORE_MAP = {
        "not_implemented": Decimal("0"),
        "not_started": Decimal("0"),
        "nao_iniciado": Decimal("0"),
        "planned": Decimal("20"),
        "partial": Decimal("40"),
        "partially_implemented": Decimal("40"),
        "in_progress": Decimal("40"),
        "em_implementacao": Decimal("40"),
        "implemented": Decimal("70"),
        "implementado": Decimal("70"),
        "implemented_evidenced": Decimal("100"),
    }

    NOT_APPLICABLE_VALUES = {"not_applicable", "n/a", "na", "not applicable"}

    @classmethod
    def normalize_mode(cls, mode):
        if mode in {
            cls.OFFICIAL,
            cls.SIMULATION,
            cls.EXPLORATORY,
        }:
            return mode
        return cls.OFFICIAL

    @classmethod
    def status_filter(cls, mode):
        mode = cls.normalize_mode(mode)
        if mode == cls.OFFICIAL:
            return [InternalControlMechanism.ValidationStatus.APPROVED]
        if mode == cls.SIMULATION:
            return [
                InternalControlMechanism.ValidationStatus.APPROVED,
                InternalControlMechanism.ValidationStatus.PENDING_REVIEW,
            ]
        return [
            InternalControlMechanism.ValidationStatus.DRAFT,
            InternalControlMechanism.ValidationStatus.PENDING_REVIEW,
            InternalControlMechanism.ValidationStatus.APPROVED,
        ]

    @classmethod
    def calculate_mechanism(cls, mechanism, mode=OFFICIAL, include_details=True, include_gaps=True, link_context=None):
        mode = cls.normalize_mode(mode)
        calculated_at = timezone.now()
        base_score, implementation_state, limitation = cls._mechanism_base_score(mechanism, link_context)
        has_operational_context = bool(link_context and hasattr(link_context, "implementation_status"))
        valid_links, expired_links, excluded_links = cls._valid_evidence_links(
            EvidenceLink.TargetType.MECHANISM,
            mechanism.id,
            mode,
        )

        if implementation_state in cls.NOT_APPLICABLE_VALUES:
            score = Decimal("0")
            status = CompliancePropagationResult.Status.NOT_APPLICABLE
        elif implementation_state == "implemented_evidenced":
            if valid_links:
                score = Decimal("100")
                status = CompliancePropagationResult.Status.COMPLIANT
            else:
                score = Decimal("70")
                status = CompliancePropagationResult.Status.MOSTLY_COMPLIANT
        elif has_operational_context:
            score = base_score
            status = cls.status_from_score(score)
        elif valid_links:
            score = Decimal("100")
            status = CompliancePropagationResult.Status.COMPLIANT
        else:
            score = base_score
            status = cls.status_from_score(score)

        gaps = []
        recommendations = []
        if (
            include_gaps
            and mode == cls.OFFICIAL
            and implementation_state == "implemented_evidenced"
            and not valid_links
        ):
            gaps.append(
                cls.gap(
                    "implemented_evidenced_without_valid_evidence",
                    "high",
                    "internal_control_mechanism" if link_context else "mechanism",
                    link_context.id if link_context else mechanism.id,
                    f"Mecanismo '{mechanism.title}' marcado como evidenciado sem evidencia valida aprovada.",
                    "Associar evidencia valida aprovada ou baixar o estado para implemented.",
                    30,
                )
            )
            recommendations.append("Validar evidencia antes de manter implemented_evidenced.")
        if (
            include_gaps
            and link_context
            and getattr(link_context, "mandatory", False)
            and implementation_state == "not_implemented"
        ):
            gaps.append(
                cls.gap(
                    "mechanism_not_implemented",
                    "high",
                    "internal_control_mechanism",
                    link_context.id,
                    f"Mecanismo obrigatorio '{mechanism.title}' ainda nao implementado.",
                    "Planear ou implementar o mecanismo obrigatorio.",
                    70,
                )
            )
            recommendations.append("Priorizar mecanismos obrigatorios nao implementados.")
        if include_gaps and status != CompliancePropagationResult.Status.NOT_APPLICABLE and not valid_links:
            gaps.append(
                cls.gap(
                    "mechanism_without_valid_evidence",
                    "medium",
                    "mechanism",
                    mechanism.id,
                    f"Mecanismo '{mechanism.title}' sem evidencia valida para scoring.",
                    "Associar pelo menos uma EvidenceItem valida com EvidenceLink aprovado.",
                    30,
                )
            )
            recommendations.append("Associar evidencia valida ao mecanismo.")
        for link in expired_links:
            gaps.append(
                cls.gap(
                    "expired_evidence",
                    "medium",
                    "evidence_item",
                    link.evidence_item_id,
                    f"Evidencia '{link.evidence_item.title}' expirada ou marcada como expirada.",
                    "Recolher evidencia atualizada antes de usar no score oficial.",
                    20,
                )
            )

        details = {}
        if include_details:
            details = {
                "implementation_state": implementation_state,
                "implementation_adapter_limitation": limitation,
                "internal_control_mechanism_id": str(link_context.id) if link_context else None,
                "mandatory": bool(getattr(link_context, "mandatory", False)) if link_context else False,
                "evidence_used": [cls.evidence_link_payload(link) for link in valid_links],
                "expired_evidence": [cls.evidence_link_payload(link) for link in expired_links],
                "excluded_evidence": [cls.evidence_link_payload(link) for link in excluded_links],
            }

        return cls.result_payload(
            CompliancePropagationResult.ResultType.MECHANISM,
            EvidenceLink.TargetType.MECHANISM,
            mechanism.id,
            score,
            status,
            mode,
            calculated_at,
            details,
            gaps if include_gaps else [],
            recommendations,
        )

    @classmethod
    def calculate_internal_control(cls, internal_control, mode=OFFICIAL, include_details=True, include_gaps=True):
        mode = cls.normalize_mode(mode)
        calculated_at = timezone.now()
        links = list(
            InternalControlMechanism.objects.select_related("mechanism")
            .filter(internal_control=internal_control, validation_status__in=cls.status_filter(mode))
            .order_by("mechanism__title")
        )
        excluded_links = list(
            InternalControlMechanism.objects.select_related("mechanism")
            .filter(internal_control=internal_control)
            .exclude(validation_status__in=cls.status_filter(mode))
        )

        considered = []
        gaps = []
        recommendations = []
        if not links:
            gaps.append(
                cls.gap(
                    "internal_control_without_mechanisms",
                    "high",
                    "internal_control",
                    internal_control.id,
                    f"Controlo interno '{internal_control.code}' sem mecanismos validos.",
                    "Associar mecanismos reutilizaveis e aprovar a associacao.",
                    60,
                )
            )
            return cls.result_payload(
                CompliancePropagationResult.ResultType.INTERNAL_CONTROL,
                EvidenceLink.TargetType.INTERNAL_CONTROL,
                internal_control.id,
                Decimal("0"),
                CompliancePropagationResult.Status.NOT_ASSESSED,
                mode,
                calculated_at,
                {"considered_mechanisms": [], "excluded_links": cls.icm_payloads(excluded_links)} if include_details else {},
                gaps if include_gaps else [],
                ["Associar mecanismos ao controlo interno."],
            )

        weights = []
        scores = []
        mandatory_zero = False
        for link in links:
            mechanism_result = cls.calculate_mechanism(
                link.mechanism,
                mode=mode,
                include_details=include_details,
                include_gaps=include_gaps,
                link_context=link,
            )
            if mechanism_result["status"] == CompliancePropagationResult.Status.NOT_APPLICABLE:
                continue
            mechanism_score = Decimal(str(mechanism_result["score"]))
            if link.mandatory and mechanism_score == 0:
                mandatory_zero = True
                gaps.append(
                    cls.gap(
                        "mandatory_mechanism_not_implemented",
                        "high",
                        "internal_control",
                        internal_control.id,
                        f"Mecanismo obrigatorio '{link.mechanism.title}' sem implementacao evidenciada.",
                        "Priorizar a implementacao ou evidencia do mecanismo obrigatorio.",
                        70,
                    )
                )
            weights.append(cls.decimal_or_default(link.contribution_weight, Decimal("100")))
            scores.append(mechanism_score)
            considered.append(
                {
                    "link_id": str(link.id),
                    "mechanism_id": str(link.mechanism_id),
                    "mechanism_title": link.mechanism.title,
                    "weight": float(cls.decimal_or_default(link.contribution_weight, Decimal("100"))),
                    "mandatory": link.mandatory,
                    "implementation_status": link.implementation_status,
                    "score": float(mechanism_score),
                    "status": mechanism_result["status"],
                }
            )
            gaps.extend(mechanism_result.get("gaps", []))

        if not scores:
            score = Decimal("0")
            status = CompliancePropagationResult.Status.NOT_APPLICABLE
        else:
            score = cls.weighted_average(scores, weights)
            status = cls.status_from_score(score, force_non_compliant=mandatory_zero)

        if mandatory_zero:
            recommendations.append("Tratar mecanismos obrigatorios antes de declarar o controlo conforme.")

        details = {}
        if include_details:
            details = {
                "considered_mechanisms": considered,
                "excluded_links": cls.icm_payloads(excluded_links),
                "weights_normalized": True,
                "mandatory_zero": mandatory_zero,
            }

        return cls.result_payload(
            CompliancePropagationResult.ResultType.INTERNAL_CONTROL,
            EvidenceLink.TargetType.INTERNAL_CONTROL,
            internal_control.id,
            score,
            status,
            mode,
            calculated_at,
            details,
            gaps if include_gaps else [],
            recommendations,
        )

    @classmethod
    def calculate_policy(cls, policy, mode=OFFICIAL, include_details=True, include_gaps=True):
        mode = cls.normalize_mode(mode)
        calculated_at = timezone.now()
        links = list(
            PolicyInternalControl.objects.select_related("internal_control")
            .filter(policy=policy, validation_status__in=cls.status_filter(mode))
            .exclude(applicability=PolicyInternalControl.Applicability.NOT_APPLICABLE)
            .order_by("internal_control__code")
        )
        excluded_links = list(
            PolicyInternalControl.objects.select_related("internal_control")
            .filter(policy=policy)
            .filter(
                Q(applicability=PolicyInternalControl.Applicability.NOT_APPLICABLE)
                | ~Q(validation_status__in=cls.status_filter(mode))
            )
        )
        return cls._average_internal_controls(
            links,
            excluded_links,
            "policy",
            policy.id,
            getattr(policy, "title", str(policy)),
            CompliancePropagationResult.ResultType.POLICY,
            EvidenceLink.TargetType.POLICY,
            mode,
            calculated_at,
            include_details,
            include_gaps,
        )

    @classmethod
    def calculate_governance_document(cls, document, mode=OFFICIAL, include_details=True, include_gaps=True):
        mode = cls.normalize_mode(mode)
        calculated_at = timezone.now()
        links = list(
            GovernanceDocumentControl.objects.select_related("internal_control")
            .filter(document=document, validation_status__in=cls.status_filter(mode))
            .order_by("internal_control__code")
        )
        excluded_links = list(
            GovernanceDocumentControl.objects.select_related("internal_control")
            .filter(document=document)
            .exclude(validation_status__in=cls.status_filter(mode))
        )
        return cls._average_internal_controls(
            links,
            excluded_links,
            "governance_document",
            document.id,
            document.title,
            CompliancePropagationResult.ResultType.GOVERNANCE_DOCUMENT,
            EvidenceLink.TargetType.GOVERNANCE_DOCUMENT,
            mode,
            calculated_at,
            include_details,
            include_gaps,
        )

    @classmethod
    def calculate_framework_control(cls, framework_control, mode=OFFICIAL, include_details=True, include_gaps=True):
        mode = cls.normalize_mode(mode)
        calculated_at = timezone.now()
        mappings = list(
            InternalControlFrameworkMapping.objects.select_related("internal_control")
            .filter(framework_control=framework_control, validation_status__in=cls.status_filter(mode))
            .order_by("internal_control__code")
        )
        excluded_mappings = list(
            InternalControlFrameworkMapping.objects.select_related("internal_control")
            .filter(framework_control=framework_control)
            .exclude(validation_status__in=cls.status_filter(mode))
        )

        if not mappings:
            gaps = [
                cls.gap(
                    "framework_control_without_internal_control",
                    "high",
                    "framework_control",
                    framework_control.id,
                    f"Controlo externo '{framework_control.code}' sem InternalControl oficial.",
                    "Mapear o controlo externo para um controlo interno aprovado.",
                    60,
                )
            ]
            return cls.result_payload(
                CompliancePropagationResult.ResultType.FRAMEWORK_CONTROL,
                EvidenceLink.TargetType.FRAMEWORK_CONTROL,
                framework_control.id,
                Decimal("0"),
                CompliancePropagationResult.Status.NOT_ASSESSED,
                mode,
                calculated_at,
                {"considered_mappings": [], "excluded_mappings": cls.icfm_payloads(excluded_mappings)} if include_details else {},
                gaps if include_gaps else [],
                ["Criar mapeamento para InternalControl."],
            )

        scores = []
        weights = []
        considered = []
        gaps = []
        for mapping in mappings:
            internal_result = cls.calculate_internal_control(
                mapping.internal_control,
                mode=mode,
                include_details=include_details,
                include_gaps=include_gaps,
            )
            if internal_result["status"] == CompliancePropagationResult.Status.NOT_APPLICABLE:
                continue
            score = Decimal(str(internal_result["score"]))
            weight = cls.decimal_or_default(mapping.coverage_percentage, Decimal("100"))
            scores.append(score)
            weights.append(weight)
            considered.append(
                {
                    "mapping_id": str(mapping.id),
                    "internal_control_id": str(mapping.internal_control_id),
                    "internal_control_code": mapping.internal_control.code,
                    "coverage_percentage": float(weight),
                    "score": float(score),
                    "status": internal_result["status"],
                }
            )
            gaps.extend(internal_result.get("gaps", []))

        if not scores:
            score = Decimal("0")
            status = CompliancePropagationResult.Status.NOT_ASSESSED
        else:
            score = cls.weighted_average(scores, weights)
            status = cls.status_from_score(score)

        details = {}
        if include_details:
            details = {
                "considered_mappings": considered,
                "excluded_mappings": cls.icfm_payloads(excluded_mappings),
                "coverage_weighted": True,
            }

        return cls.result_payload(
            CompliancePropagationResult.ResultType.FRAMEWORK_CONTROL,
            EvidenceLink.TargetType.FRAMEWORK_CONTROL,
            framework_control.id,
            score,
            status,
            mode,
            calculated_at,
            details,
            gaps if include_gaps else [],
            [],
        )

    @classmethod
    def calculate_framework(cls, framework, mode=OFFICIAL, include_details=True, include_gaps=True):
        mode = cls.normalize_mode(mode)
        calculated_at = timezone.now()
        controls = list(Control.objects.filter(framework=framework).order_by("code"))
        results = []
        assessed_scores = []
        gaps = []

        for control in controls:
            control_result = cls.calculate_framework_control(
                control,
                mode=mode,
                include_details=include_details,
                include_gaps=include_gaps,
            )
            results.append(
                {
                    "control_id": str(control.id),
                    "control_code": control.code,
                    "score": control_result["score"],
                    "status": control_result["status"],
                }
            )
            if control_result["status"] != CompliancePropagationResult.Status.NOT_ASSESSED:
                assessed_scores.append(Decimal(str(control_result["score"])))
            gaps.extend(control_result.get("gaps", []))

        total_controls = len(controls)
        assessed_controls = len(assessed_scores)
        coverage = cls.quantize((Decimal(assessed_controls) / Decimal(total_controls)) * 100) if total_controls else Decimal("0")
        if assessed_scores:
            score = cls.average(assessed_scores)
            status = cls.status_from_score(score)
        else:
            score = Decimal("0")
            status = CompliancePropagationResult.Status.NOT_ASSESSED

        if include_gaps and total_controls and coverage < 80:
            gaps.append(
                cls.gap(
                    "framework_low_coverage",
                    "medium",
                    "framework",
                    framework.id,
                    f"Framework '{framework.code}' com cobertura de avaliacao inferior a 80%.",
                    "Completar mapeamentos InternalControl -> Control externo.",
                    int(80 - coverage),
                )
            )

        details = {}
        if include_details:
            details = {
                "score_approach": "Average of assessed controls; not assessed controls affect coverage, not score.",
                "controls": results,
                "total_controls": total_controls,
                "assessed_controls": assessed_controls,
                "coverage": float(coverage),
            }

        return cls.result_payload(
            CompliancePropagationResult.ResultType.FRAMEWORK,
            "framework",
            framework.id,
            score,
            status,
            mode,
            calculated_at,
            details,
            gaps if include_gaps else [],
            [],
            extra={"coverage": float(coverage)},
        )

    @classmethod
    def calculate_domain(cls, domain, mode=OFFICIAL, include_details=True, include_gaps=True):
        mode = cls.normalize_mode(mode)
        calculated_at = timezone.now()
        domain_label = domain or "uncategorized"
        internal_controls = list(
            InternalControl.objects.filter(control_domain=domain, is_active=True).order_by("code")
        )
        results = []
        assessed_scores = []
        gaps = []

        for internal_control in internal_controls:
            control_result = cls.calculate_internal_control(
                internal_control,
                mode=mode,
                include_details=include_details,
                include_gaps=include_gaps,
            )
            results.append(
                {
                    "internal_control_id": str(internal_control.id),
                    "internal_control_code": internal_control.code,
                    "score": control_result["score"],
                    "status": control_result["status"],
                }
            )
            if control_result["status"] not in {
                CompliancePropagationResult.Status.NOT_ASSESSED,
                CompliancePropagationResult.Status.NOT_APPLICABLE,
            }:
                assessed_scores.append(Decimal(str(control_result["score"])))
            gaps.extend(control_result.get("gaps", []))

        total_controls = len(internal_controls)
        assessed_controls = len(assessed_scores)
        coverage = cls.quantize((Decimal(assessed_controls) / Decimal(total_controls)) * 100) if total_controls else Decimal("0")
        if assessed_scores:
            score = cls.average(assessed_scores)
            status = cls.status_from_score(score)
        else:
            score = Decimal("0")
            status = CompliancePropagationResult.Status.NOT_ASSESSED

        details = {}
        if include_details:
            details = {
                "domain": domain_label,
                "internal_controls": results,
                "total_controls": total_controls,
                "assessed_controls": assessed_controls,
                "coverage": float(coverage),
            }

        return cls.result_payload(
            CompliancePropagationResult.ResultType.DOMAIN,
            "domain",
            domain_label,
            score,
            status,
            mode,
            calculated_at,
            details,
            gaps if include_gaps else [],
            [],
            extra={"coverage": float(coverage)},
        )

    @classmethod
    def calculate_all_domains(cls, mode=OFFICIAL, include_details=True, include_gaps=True):
        domains = (
            InternalControl.objects.filter(is_active=True)
            .order_by("control_domain")
            .values_list("control_domain", flat=True)
            .distinct()
        )
        return [
            cls.calculate_domain(domain, mode=mode, include_details=include_details, include_gaps=include_gaps)
            for domain in domains
        ]

    @classmethod
    def collect_gaps(cls, mode=OFFICIAL):
        mode = cls.normalize_mode(mode)
        gaps = []
        status_filter = cls.status_filter(mode)

        for internal_control in InternalControl.objects.filter(is_active=True):
            if not internal_control.mechanism_links.filter(validation_status__in=status_filter).exists():
                gaps.append(
                    cls.gap(
                        "internal_control_without_mechanisms",
                        "high",
                        "internal_control",
                        internal_control.id,
                        f"Controlo interno '{internal_control.code}' sem mecanismos validos.",
                        "Associar mecanismos reutilizaveis ao controlo interno.",
                        60,
                    )
                )
            if not internal_control.framework_mappings.filter(validation_status__in=status_filter).exists():
                gaps.append(
                    cls.gap(
                        "internal_control_without_framework_mapping",
                        "medium",
                        "internal_control",
                        internal_control.id,
                        f"Controlo interno '{internal_control.code}' sem mapeamento para frameworks.",
                        "Mapear o controlo interno para os controlos externos relevantes.",
                        45,
                    )
                )

        for policy in Policy.objects.all():
            if not policy.internal_control_links.filter(validation_status__in=status_filter).exists():
                gaps.append(
                    cls.gap(
                        "policy_without_internal_controls",
                        "medium",
                        "policy",
                        policy.id,
                        f"Politica '{policy.title}' sem controlos internos validos.",
                        "Associar controlos internos a politica.",
                        40,
                    )
                )

        for document in GovernanceDocument.objects.filter(is_active=True):
            if not document.control_links.filter(validation_status__in=status_filter).exists():
                gaps.append(
                    cls.gap(
                        "governance_document_without_internal_controls",
                        "medium",
                        "governance_document",
                        document.id,
                        f"Documento '{document.title}' sem controlos internos validos.",
                        "Associar controlos internos ao documento.",
                        35,
                    )
                )

        for mechanism in Mechanism.objects.all():
            result = cls.calculate_mechanism(mechanism, mode=mode, include_details=False, include_gaps=False)
            if result["score"] == 0:
                gaps.append(
                    cls.gap(
                        "mechanism_without_valid_evidence",
                        "medium",
                        "mechanism",
                        mechanism.id,
                        f"Mecanismo '{mechanism.title}' sem evidencia valida.",
                        "Associar evidencia valida ao mecanismo.",
                        30,
                    )
                )

        for evidence in EvidenceItem.objects.filter(Q(status=EvidenceItem.Status.EXPIRED) | Q(valid_until__lt=timezone.localdate())):
            gaps.append(
                cls.gap(
                    "expired_evidence",
                    "medium",
                    "evidence_item",
                    evidence.id,
                    f"Evidencia '{evidence.title}' expirada.",
                    "Renovar ou substituir a evidencia.",
                    20,
                )
            )

        pending_or_rejected_statuses = [
            InternalControlMechanism.ValidationStatus.PENDING_REVIEW,
            InternalControlMechanism.ValidationStatus.REJECTED,
        ]
        for mapping in InternalControlFrameworkMapping.objects.filter(validation_status__in=pending_or_rejected_statuses):
            gaps.append(
                cls.gap(
                    f"framework_mapping_{mapping.validation_status}",
                    "low" if mapping.validation_status == mapping.ValidationStatus.PENDING_REVIEW else "medium",
                    "internal_control_framework_mapping",
                    mapping.id,
                    f"Mapeamento '{mapping}' em estado {mapping.validation_status}.",
                    "Rever e aprovar, rejeitar ou depreciar formalmente o mapeamento.",
                    15,
                )
            )

        for control in Control.objects.all():
            if not control.internal_control_mappings.filter(validation_status__in=status_filter).exists():
                gaps.append(
                    cls.gap(
                        "framework_control_without_internal_control",
                        "high",
                        "framework_control",
                        control.id,
                        f"Controlo externo '{control.code}' sem InternalControl valido.",
                        "Criar ou aprovar mapeamento para InternalControl.",
                        60,
                    )
                )

        for link in InternalControlMechanism.objects.select_related("mechanism").filter(validation_status__in=status_filter):
            valid_links, _expired_links, _excluded_links = cls._valid_evidence_links(
                EvidenceLink.TargetType.MECHANISM,
                link.mechanism_id,
                mode,
            )
            if (
                mode == cls.OFFICIAL
                and link.implementation_status == InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED
                and not valid_links
            ):
                gaps.append(
                    cls.gap(
                        "implemented_evidenced_without_valid_evidence",
                        "high",
                        "internal_control_mechanism",
                        link.id,
                        f"Mecanismo '{link.mechanism.title}' marcado como evidenciado sem evidencia valida aprovada.",
                        "Associar evidencia valida aprovada ou baixar o estado para implemented.",
                        30,
                    )
                )
            if not link.mandatory:
                continue
            result = cls.calculate_mechanism(link.mechanism, mode=mode, include_details=False, include_gaps=False, link_context=link)
            if link.implementation_status == InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED:
                gaps.append(
                    cls.gap(
                        "mechanism_not_implemented",
                        "high",
                        "internal_control_mechanism",
                        link.id,
                        f"Mecanismo obrigatorio '{link.mechanism.title}' ainda nao implementado.",
                        "Planear ou implementar o mecanismo obrigatorio.",
                        70,
                    )
                )
            if result["score"] == 0:
                gaps.append(
                    cls.gap(
                        "mandatory_mechanism_not_implemented",
                        "high",
                        "internal_control",
                        link.internal_control_id,
                        f"Mecanismo obrigatorio '{link.mechanism.title}' sem score.",
                        "Tratar primeiro os mecanismos obrigatorios.",
                        70,
                    )
                )

        for framework in Framework.objects.all():
            framework_result = cls.calculate_framework(framework, mode=mode, include_details=False, include_gaps=False)
            if framework_result.get("coverage", 0) < 80:
                gaps.append(
                    cls.gap(
                        "framework_low_coverage",
                        "medium",
                        "framework",
                        framework.id,
                        f"Framework '{framework.code}' com cobertura inferior a 80%.",
                        "Completar mapeamentos e evidencias para aumentar cobertura.",
                        int(80 - framework_result.get("coverage", 0)),
                    )
                )

        return gaps

    @classmethod
    def recalculate(cls, mode=OFFICIAL, include_details=True, include_gaps=True):
        mode = cls.normalize_mode(mode)
        summary = {
            "calculation_mode": mode,
            "persisted_results": 0,
            "result_counts": {},
        }
        calculation_sets = [
            (Mechanism.objects.all(), cls.calculate_mechanism),
            (InternalControl.objects.all(), cls.calculate_internal_control),
            (Policy.objects.all(), cls.calculate_policy),
            (GovernanceDocument.objects.all(), cls.calculate_governance_document),
            (Control.objects.all(), cls.calculate_framework_control),
            (Framework.objects.all(), cls.calculate_framework),
        ]
        for queryset, calculator in calculation_sets:
            for obj in queryset:
                result = calculator(obj, mode=mode, include_details=include_details, include_gaps=include_gaps)
                cls.persist_result(result)
                summary["persisted_results"] += 1
                summary["result_counts"][result["result_type"]] = summary["result_counts"].get(result["result_type"], 0) + 1
        for result in cls.calculate_all_domains(mode=mode, include_details=include_details, include_gaps=include_gaps):
            cls.persist_result(result)
            summary["persisted_results"] += 1
            summary["result_counts"][result["result_type"]] = summary["result_counts"].get(result["result_type"], 0) + 1
        return summary

    @classmethod
    def preview(cls, payload, mode=OFFICIAL, include_details=True, include_gaps=True):
        target_type = payload.get("target_type") if payload else None
        target_id = payload.get("target_id") if payload else None
        if not target_type or not target_id:
            return {
                "calculation_mode": cls.normalize_mode(mode),
                "persisted": False,
                "gaps": cls.collect_gaps(mode) if include_gaps else [],
            }
        return {
            "persisted": False,
            "result": cls.calculate_target(target_type, target_id, mode, include_details, include_gaps),
        }

    @classmethod
    def calculate_target(cls, target_type, target_id, mode=OFFICIAL, include_details=True, include_gaps=True):
        target_map = {
            "mechanism": (Mechanism, cls.calculate_mechanism),
            "internal_control": (InternalControl, cls.calculate_internal_control),
            "policy": (Policy, cls.calculate_policy),
            "governance_document": (GovernanceDocument, cls.calculate_governance_document),
            "framework_control": (Control, cls.calculate_framework_control),
            "framework": (Framework, cls.calculate_framework),
            "domain": (None, cls.calculate_domain),
        }
        if target_type not in target_map:
            raise ValueError("Unsupported target_type.")
        model, calculator = target_map[target_type]
        if target_type == "domain":
            return calculator(target_id, mode=mode, include_details=include_details, include_gaps=include_gaps)
        obj = model.objects.get(pk=target_id)
        return calculator(obj, mode=mode, include_details=include_details, include_gaps=include_gaps)

    @classmethod
    def persist_result(cls, result):
        defaults = {
            "score": Decimal(str(result["score"])).quantize(Decimal("0.01")),
            "status": result["status"],
            "calculation_mode": result["calculation_mode"],
            "calculated_at": timezone.now(),
            "details": result.get("details", {}),
            "gaps": result.get("gaps", []),
            "recommendations": result.get("recommendations", []),
        }
        obj, _created = CompliancePropagationResult.objects.update_or_create(
            result_type=result["result_type"],
            target_type=result["target_type"],
            target_id=str(result["target_id"]),
            calculation_mode=result["calculation_mode"],
            defaults=defaults,
        )
        return obj

    @classmethod
    def _average_internal_controls(
        cls,
        links,
        excluded_links,
        gap_target_type,
        target_id,
        target_label,
        result_type,
        response_target_type,
        mode,
        calculated_at,
        include_details,
        include_gaps,
    ):
        if not links:
            gap = cls.gap(
                f"{gap_target_type}_without_internal_controls",
                "medium",
                gap_target_type,
                target_id,
                f"Entidade '{target_label}' sem controlos internos validos.",
                "Associar e aprovar controlos internos.",
                40,
            )
            return cls.result_payload(
                result_type,
                response_target_type,
                target_id,
                Decimal("0"),
                CompliancePropagationResult.Status.NOT_ASSESSED,
                mode,
                calculated_at,
                {"considered_internal_controls": [], "excluded_links": cls.generic_link_payloads(excluded_links)} if include_details else {},
                [gap] if include_gaps else [],
                ["Associar controlos internos."],
            )

        scores = []
        considered = []
        gaps = []
        for link in links:
            internal_result = cls.calculate_internal_control(
                link.internal_control,
                mode=mode,
                include_details=include_details,
                include_gaps=include_gaps,
            )
            if internal_result["status"] == CompliancePropagationResult.Status.NOT_APPLICABLE:
                continue
            score = Decimal(str(internal_result["score"]))
            scores.append(score)
            considered.append(
                {
                    "link_id": str(link.id),
                    "internal_control_id": str(link.internal_control_id),
                    "internal_control_code": link.internal_control.code,
                    "score": float(score),
                    "status": internal_result["status"],
                }
            )
            gaps.extend(internal_result.get("gaps", []))

        if not scores:
            score = Decimal("0")
            status = CompliancePropagationResult.Status.NOT_ASSESSED
        else:
            score = cls.average(scores)
            status = cls.status_from_score(score)

        details = {}
        if include_details:
            details = {
                "considered_internal_controls": considered,
                "excluded_links": cls.generic_link_payloads(excluded_links),
            }

        return cls.result_payload(
            result_type,
            response_target_type,
            target_id,
            score,
            status,
            mode,
            calculated_at,
            details,
            gaps if include_gaps else [],
            [],
        )

    @classmethod
    def _valid_evidence_links(cls, target_type, target_id, mode):
        allowed_statuses = cls.status_filter(mode)
        base = (
            EvidenceLink.objects.select_related("evidence_item")
            .filter(target_type=target_type, target_id=target_id, link_type__in=cls.VALID_EVIDENCE_LINK_TYPES)
        )
        active = list(base.filter(validation_status__in=allowed_statuses))
        valid = [link for link in active if link.evidence_item.is_score_eligible]
        expired = [
            link
            for link in active
            if link.evidence_item.status == EvidenceItem.Status.EXPIRED or link.evidence_item.is_expired
        ]
        excluded = list(
            base.filter(
                ~Q(validation_status__in=allowed_statuses)
                | Q(
                    evidence_item__status__in=[
                        EvidenceItem.Status.REJECTED,
                        EvidenceItem.Status.DEPRECATED,
                    ]
                )
            )
        )
        return valid, expired, excluded

    @classmethod
    def _mechanism_base_score(cls, mechanism, link_context=None):
        implementation_state = cls._implementation_state(mechanism, link_context)
        if implementation_state in cls.NOT_APPLICABLE_VALUES:
            return Decimal("0"), implementation_state, False
        if implementation_state:
            return cls.IMPLEMENTATION_SCORE_MAP.get(implementation_state, Decimal("0")), implementation_state, False
        return Decimal("0"), "not_available", True

    @classmethod
    def _implementation_state(cls, mechanism, link_context=None):
        for obj in [link_context, mechanism]:
            if not obj:
                continue
            for field_name in ("implementation_status", "implementation_state", "implementation_phase"):
                if hasattr(obj, field_name):
                    value = getattr(obj, field_name)
                    if value:
                        return cls.normalize_state(value)
        return None

    @staticmethod
    def normalize_state(value):
        return str(value).strip().lower().replace(" ", "_").replace("-", "_")

    @staticmethod
    def decimal_or_default(value, default):
        if value is None:
            return default
        return Decimal(str(value))

    @classmethod
    def average(cls, values):
        if not values:
            return Decimal("0")
        return cls.quantize(sum(values, Decimal("0")) / Decimal(len(values)))

    @classmethod
    def weighted_average(cls, scores, weights):
        if not scores:
            return Decimal("0")
        if not weights or sum(weights, Decimal("0")) <= 0:
            return cls.average(scores)
        numerator = sum((score * weight for score, weight in zip(scores, weights)), Decimal("0"))
        denominator = sum(weights, Decimal("0"))
        return cls.quantize(numerator / denominator)

    @staticmethod
    def quantize(value):
        return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @classmethod
    def status_from_score(cls, score, force_non_compliant=False):
        if force_non_compliant:
            return CompliancePropagationResult.Status.NON_COMPLIANT
        score = Decimal(str(score))
        if score >= 90:
            return CompliancePropagationResult.Status.COMPLIANT
        if score >= 70:
            return CompliancePropagationResult.Status.MOSTLY_COMPLIANT
        if score >= 40:
            return CompliancePropagationResult.Status.PARTIALLY_COMPLIANT
        return CompliancePropagationResult.Status.NON_COMPLIANT

    @staticmethod
    def gap(gap_type, severity, target_type, target_id, description, recommendation, estimated_impact):
        return {
            "type": gap_type,
            "severity": severity,
            "target_type": target_type,
            "target_id": str(target_id),
            "description": description,
            "recommendation": recommendation,
            "estimated_impact": estimated_impact,
        }

    @classmethod
    def result_payload(
        cls,
        result_type,
        target_type,
        target_id,
        score,
        status,
        mode,
        calculated_at,
        details,
        gaps,
        recommendations,
        extra=None,
    ):
        score_decimal = cls.quantize(Decimal(str(score)))
        active_exceptions = cls.active_governance_exceptions(target_type, target_id)
        exception_payloads = cls.governance_exception_payloads(active_exceptions)
        exception_score_impact = sum(
            (Decimal(str(item["score_impact"])) for item in exception_payloads),
            Decimal("0"),
        )
        adjusted_score = max(Decimal("0"), min(Decimal("100"), score_decimal + exception_score_impact))
        if active_exceptions:
            details = dict(details or {})
            details["governance_exceptions"] = {
                "note": "O score factual nao e alterado. O adjusted_score mostra o efeito declarado das excecoes aprovadas.",
                "active": exception_payloads,
                "score_impact": float(cls.quantize(exception_score_impact)),
                "adjusted_score": float(cls.quantize(adjusted_score)),
            }
            gaps = list(gaps or [])
            gaps.append(
                cls.gap(
                    "governance_exception_active",
                    "info",
                    target_type,
                    target_id,
                    "Existe uma excecao ou aceitacao temporaria aprovada para este alvo.",
                    "Rever a excecao antes do prazo e garantir que o controlo compensatorio e suficiente.",
                    float(abs(exception_score_impact)),
                )
            )
            recommendations = list(recommendations or [])
            recommendations.append("Acompanhar a excecao aprovada sem esconder o score factual de implementacao.")

        payload = {
            "result_type": result_type,
            "target_type": target_type,
            "target_id": str(target_id),
            "score": float(score_decimal),
            "adjusted_score": float(cls.quantize(adjusted_score)) if active_exceptions else float(score_decimal),
            "status": status,
            "calculation_mode": cls.normalize_mode(mode),
            "calculated_at": calculated_at.isoformat(),
            "details": details,
            "gaps": gaps,
            "recommendations": recommendations,
        }
        if extra:
            payload.update(extra)
        return payload

    @staticmethod
    def active_governance_exceptions(target_type, target_id):
        today = timezone.localdate()
        supported_targets = {choice[0] for choice in GovernanceException.TargetType.choices}
        if target_type not in supported_targets:
            return []
        return list(
            GovernanceException.objects.filter(
                target_type=target_type,
                target_id=str(target_id),
                approval_status=GovernanceException.ApprovalStatus.APPROVED,
            )
            .filter(Q(valid_from__isnull=True) | Q(valid_from__lte=today))
            .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=today))
            .order_by("valid_until", "title")
        )

    @staticmethod
    def governance_exception_payloads(exceptions):
        return [
            {
                "id": str(exception.id),
                "exception_type": exception.exception_type,
                "title": exception.title,
                "valid_until": exception.valid_until.isoformat() if exception.valid_until else None,
                "owner": exception.owner,
                "approver": exception.approver,
                "score_impact": float(exception.score_impact),
                "compensating_control": exception.compensating_control_description,
            }
            for exception in exceptions
        ]

    @staticmethod
    def evidence_link_payload(link):
        return {
            "link_id": str(link.id),
            "evidence_item_id": str(link.evidence_item_id),
            "title": link.evidence_item.title,
            "status": link.evidence_item.status,
            "validation_status": link.validation_status,
            "valid_until": link.evidence_item.valid_until.isoformat() if link.evidence_item.valid_until else None,
            "confidence_level": float(link.evidence_item.confidence_level),
        }

    @staticmethod
    def icm_payloads(links):
        return [
            {
                "link_id": str(link.id),
                "mechanism_id": str(link.mechanism_id),
                "mechanism_title": link.mechanism.title,
                "implementation_status": link.implementation_status,
                "validation_status": link.validation_status,
            }
            for link in links
        ]

    @staticmethod
    def icfm_payloads(mappings):
        return [
            {
                "mapping_id": str(mapping.id),
                "internal_control_id": str(mapping.internal_control_id),
                "internal_control_code": mapping.internal_control.code,
                "validation_status": mapping.validation_status,
                "coverage_percentage": float(mapping.coverage_percentage),
            }
            for mapping in mappings
        ]

    @staticmethod
    def generic_link_payloads(links):
        payloads = []
        for link in links:
            item = {"link_id": str(link.id), "validation_status": link.validation_status}
            if hasattr(link, "internal_control"):
                item["internal_control_id"] = str(link.internal_control_id)
                item["internal_control_code"] = link.internal_control.code
            payloads.append(item)
        return payloads
