from django.core.management.base import BaseCommand

from governance.models import (
    EvidenceItem,
    EvidenceLink,
    InternalControlMechanism,
    MechanismEvidenceRequirement,
    PolicyInternalControl,
)


class Command(BaseCommand):
    help = "Cria EvidenceItem/EvidenceLink esperados para mecanismos sem evidencias associadas."

    def add_arguments(self, parser):
        parser.add_argument(
            "--policy",
            dest="policy_id",
            default=None,
            help="Opcional: limita o bootstrap aos controlos internos associados a uma Policy.",
        )
        parser.add_argument(
            "--limit-per-mechanism",
            dest="limit_per_mechanism",
            type=int,
            default=1,
            help="Numero maximo de evidencias esperadas a criar por mecanismo.",
        )

    def handle(self, *args, **options):
        policy_id = options.get("policy_id")
        limit = max(1, int(options.get("limit_per_mechanism") or 1))
        stats = {
            "mappings": 0,
            "unique_mechanisms": 0,
            "already_linked": 0,
            "created_items": 0,
            "created_links": 0,
            "without_requirements": 0,
            "errors": [],
        }

        qs = InternalControlMechanism.objects.select_related("internal_control", "mechanism").exclude(
            validation_status__in=[
                InternalControlMechanism.ValidationStatus.REJECTED,
                InternalControlMechanism.ValidationStatus.DEPRECATED,
            ]
        )

        if policy_id:
            internal_control_ids = PolicyInternalControl.objects.filter(policy_id=policy_id).exclude(
                validation_status__in=[
                    PolicyInternalControl.ValidationStatus.REJECTED,
                    PolicyInternalControl.ValidationStatus.DEPRECATED,
                ]
            ).values_list("internal_control_id", flat=True)
            qs = qs.filter(internal_control_id__in=internal_control_ids)

        seen_mechanisms = set()
        requirements = list(MechanismEvidenceRequirement.objects.filter(is_active=True).select_related("mechanism"))
        mechanism_target_content_type = EvidenceLink.content_type_for_target_type(EvidenceLink.TargetType.MECHANISM)
        candidate_mappings = []

        for mapping in qs.order_by("internal_control__code", "mechanism__title"):
            stats["mappings"] += 1
            mechanism = mapping.mechanism
            if mechanism.id in seen_mechanisms:
                continue
            seen_mechanisms.add(mechanism.id)
            stats["unique_mechanisms"] += 1

            candidate_mappings.append(mapping)

        existing_mechanism_ids = set(
            EvidenceLink.objects.filter(
                target_type=EvidenceLink.TargetType.MECHANISM,
                target_id__in=[mapping.mechanism_id for mapping in candidate_mappings],
            ).exclude(
                validation_status__in=[
                    EvidenceLink.ValidationStatus.REJECTED,
                    EvidenceLink.ValidationStatus.DEPRECATED,
                ]
            ).values_list("target_id", flat=True)
        )

        evidence_items_to_create = []
        link_specs = []

        for mapping in candidate_mappings:
            mechanism = mapping.mechanism
            if mechanism.id in existing_mechanism_ids:
                stats["already_linked"] += 1
                continue

            control_domain = mapping.internal_control.control_domain or ""
            matched_requirements = [
                requirement
                for requirement in requirements
                if requirement.matches_mechanism(mechanism, control_domain)
            ][:limit]

            if not matched_requirements:
                stats["without_requirements"] += 1
                matched_requirements = [
                    type("FallbackRequirement", (), {
                        "title": "Registo de implementacao do mecanismo",
                        "description": "Registo esperado para demonstrar que o mecanismo foi implementado.",
                        "evidence_type": EvidenceItem.EvidenceType.MANUAL_ATTESTATION,
                        "rationale": "Fallback gerado porque nao existia template especifico para este mecanismo.",
                    })()
                ]

            for requirement in matched_requirements:
                try:
                    title = f"{requirement.title} - {mechanism.title}"
                    evidence_item = EvidenceItem(
                        title=title[:255],
                        description=requirement.description,
                        evidence_type=requirement.evidence_type,
                        source="mechanism_evidence_requirement",
                        external_reference=str(getattr(requirement, "id", "")),
                        confidence_level=0,
                        status=EvidenceItem.Status.DRAFT,
                        owner=mapping.internal_control.owner_role or "",
                        is_active=True,
                    )
                    evidence_items_to_create.append(evidence_item)
                    link_specs.append((evidence_item, mechanism.id, requirement))
                except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                    stats["errors"].append(f"{mechanism.title}: {exc}")

        if evidence_items_to_create:
            EvidenceItem.objects.bulk_create(evidence_items_to_create, batch_size=100)
            stats["created_items"] += len(evidence_items_to_create)

            links_to_create = []
            for evidence_item, mechanism_id, requirement in link_specs:
                links_to_create.append(EvidenceLink(
                    evidence_item=evidence_item,
                    target_type=EvidenceLink.TargetType.MECHANISM,
                    target_id=mechanism_id,
                    target_content_type=mechanism_target_content_type,
                    link_type=EvidenceLink.LinkType.REQUIRED_BY,
                    rationale=(
                        "Evidencia esperada criada automaticamente a partir do catalogo "
                        f"do mecanismo. {getattr(requirement, 'rationale', '')}"
                    ).strip(),
                    mapping_source=EvidenceLink.MappingSource.TEMPLATE,
                    validation_status=EvidenceLink.ValidationStatus.DRAFT,
                    confidence_score=0,
                ))
            EvidenceLink.objects.bulk_create(links_to_create, batch_size=100)
            stats["created_links"] += len(links_to_create)

        self.stdout.write(self.style.SUCCESS("Bootstrap de evidencias esperadas por mecanismo concluido."))
        if policy_id:
            self.stdout.write(f"Policy filtrada: {policy_id}")
        self.stdout.write(f"InternalControlMechanism analisados: {stats['mappings']}")
        self.stdout.write(f"Mecanismos unicos analisados: {stats['unique_mechanisms']}")
        self.stdout.write(f"Mecanismos ja com evidencias: {stats['already_linked']}")
        self.stdout.write(f"EvidenceItem criados: {stats['created_items']}")
        self.stdout.write(f"EvidenceLink criados: {stats['created_links']}")
        self.stdout.write(f"Mecanismos sem template especifico: {stats['without_requirements']}")
        if stats["errors"]:
            self.stdout.write(self.style.ERROR("Erros:"))
            for error in stats["errors"]:
                self.stdout.write(f"- {error}")
        else:
            self.stdout.write("Erros: 0")
