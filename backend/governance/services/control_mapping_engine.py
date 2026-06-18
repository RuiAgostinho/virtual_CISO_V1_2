from collections import defaultdict
from decimal import Decimal
from itertools import combinations

from django.db import transaction
from django.db.models import Sum

from governance.models import (
    ComplianceGap,
    Control,
    ControlMapping,
    ControlMechanism,
    Framework,
    SuggestedMechanism,
)


AUTO_RATIONALE_PREFIX = "Mapeamento automatico por mecanismos partilhados."


class ControlMappingEngine:
    """
    Builds cross-framework control mappings from the operational mechanism layer.

    The mechanism library is the bridge between frameworks: when two controls from
    different frameworks are implemented by the same concrete mechanisms, the
    platform can infer a traceable relationship between those controls.
    """

    @staticmethod
    def build_mappings(min_shared_mechanisms: int = 1) -> dict:
        min_shared_mechanisms = max(int(min_shared_mechanisms or 1), 1)
        control_mechanisms, mechanism_controls = ControlMappingEngine._load_mechanism_links()

        candidates = ControlMappingEngine._build_candidates(
            control_mechanisms=control_mechanisms,
            mechanism_controls=mechanism_controls,
            min_shared_mechanisms=min_shared_mechanisms,
        )

        with transaction.atomic():
            deleted, _ = ControlMapping.objects.filter(
                rationale__startswith=AUTO_RATIONALE_PREFIX
            ).delete()

            existing_pairs = set(
                ControlMapping.objects.values_list("source_control_id", "target_control_id")
            )

            mappings_to_create = []
            skipped_existing = 0

            for source_id, target_id, payload in candidates:
                if (source_id, target_id) in existing_pairs:
                    skipped_existing += 1
                    continue
                mappings_to_create.append(
                    ControlMapping(
                        source_control_id=source_id,
                        target_control_id=target_id,
                        mapping_type=payload["mapping_type"],
                        confidence=Decimal(str(payload["confidence"])),
                        rationale=payload["rationale"],
                    )
                )

            ControlMapping.objects.bulk_create(mappings_to_create, ignore_conflicts=True)

        return {
            "deleted_auto_mappings": deleted,
            "created_mappings": len(mappings_to_create),
            "skipped_existing_mappings": skipped_existing,
            "candidate_mappings": len(candidates),
            "min_shared_mechanisms": min_shared_mechanisms,
        }

    @staticmethod
    def overview() -> dict:
        mappings = ControlMapping.objects.select_related(
            "source_control__framework",
            "target_control__framework",
        )

        mapped_control_ids = set(mappings.values_list("source_control_id", flat=True))
        mapped_control_ids.update(mappings.values_list("target_control_id", flat=True))

        # When the internal-control governance layer exists, the official posture
        # is the propagation model (internal control -> mechanism -> evidence),
        # the same source the assistant uses. Fall back to the legacy gap-based
        # score only when there are no internal controls.
        from governance.models import InternalControl
        from governance.services.compliance_propagation_engine import CompliancePropagationEngine

        if InternalControl.objects.filter(is_active=True).exists():
            framework_scores = CompliancePropagationEngine.framework_scores()
        else:
            framework_scores = ControlMappingEngine.framework_scores()

        return {
            "framework_scores": framework_scores,
            "mapping_summary": {
                "total_mappings": mappings.count(),
                "equivalent": mappings.filter(mapping_type=ControlMapping.MappingType.EQUIVALENT).count(),
                "partial": mappings.filter(mapping_type=ControlMapping.MappingType.PARTIAL).count(),
                "supports": mappings.filter(mapping_type=ControlMapping.MappingType.SUPPORTS).count(),
                "conflicts": mappings.filter(mapping_type=ControlMapping.MappingType.CONFLICTS).count(),
                "mapped_controls": len(mapped_control_ids),
                "frameworks": Framework.objects.filter(is_active=True).count(),
            },
        }

    @staticmethod
    def framework_scores() -> list[dict]:
        scores = []

        for framework in Framework.objects.filter(is_active=True).order_by("name"):
            controls = Control.objects.filter(framework=framework)
            total = controls.count()
            gaps = ComplianceGap.objects.filter(framework=framework)
            evaluated = gaps.count()

            implemented = gaps.filter(status="IMPLEMENTED").count()
            partial = gaps.filter(status="PARTIAL").count()
            missing = gaps.filter(status="MISSING").count() + max(total - evaluated, 0)

            score = 0.0
            if total:
                score = ((implemented + 0.5 * partial) / total) * 100

            outbound_ids = ControlMapping.objects.filter(
                source_control__framework=framework
            ).exclude(target_control__framework=framework).values_list("source_control_id", flat=True)
            inbound_ids = ControlMapping.objects.filter(
                target_control__framework=framework
            ).exclude(source_control__framework=framework).values_list("target_control_id", flat=True)
            mapped_control_ids = set(outbound_ids)
            mapped_control_ids.update(inbound_ids)

            mapping_coverage = 0.0
            if total:
                mapping_coverage = (len(mapped_control_ids) / total) * 100

            evidence_count = gaps.aggregate(total=Sum("evidence_count"))["total"] or 0
            score_status = "measured" if total else "not_configured"

            scores.append(
                {
                    "framework_id": str(framework.id),
                    "framework_name": framework.name,
                    "framework_code": framework.code,
                    "version": framework.version,
                    "total_controls": total,
                    "evaluated_controls": evaluated,
                    "missing": missing,
                    "partial": partial,
                    "implemented": implemented,
                    "score": round(score, 1),
                    "mapped_controls": len(mapped_control_ids),
                    "mapping_coverage": round(mapping_coverage, 1),
                    "evidence_count": evidence_count,
                    "has_controls": total > 0,
                    "score_status": score_status,
                }
            )

        return scores

    @staticmethod
    def _load_mechanism_links():
        control_mechanisms = defaultdict(dict)
        mechanism_controls = defaultdict(dict)

        suggested_links = SuggestedMechanism.objects.select_related(
            "mechanism",
            "control__framework",
        ).order_by("mechanism__title", "control__framework__name", "control__code")

        for link in suggested_links:
            control_mechanisms[link.control_id][link.mechanism_id] = link.mechanism.title
            mechanism_controls[link.mechanism_id][link.control_id] = link.control

        if control_mechanisms:
            return control_mechanisms, mechanism_controls

        implemented_links = ControlMechanism.objects.select_related(
            "mechanism",
            "control__framework",
        ).order_by("mechanism__title", "control__framework__name", "control__code")

        for link in implemented_links:
            control_mechanisms[link.control_id][link.mechanism_id] = link.mechanism.title
            mechanism_controls[link.mechanism_id][link.control_id] = link.control

        return control_mechanisms, mechanism_controls

    @staticmethod
    def _build_candidates(control_mechanisms, mechanism_controls, min_shared_mechanisms: int):
        controls_by_id = {}
        pair_shared_mechanisms = defaultdict(set)

        for mechanism_id, controls in mechanism_controls.items():
            unique_controls = list(controls.values())
            for control in unique_controls:
                controls_by_id[control.id] = control

            for source, target in combinations(unique_controls, 2):
                if source.framework_id == target.framework_id:
                    continue
                pair_shared_mechanisms[(source.id, target.id)].add(mechanism_id)
                pair_shared_mechanisms[(target.id, source.id)].add(mechanism_id)

        candidates = []
        for (source_id, target_id), shared_mechanism_ids in pair_shared_mechanisms.items():
            if len(shared_mechanism_ids) < min_shared_mechanisms:
                continue

            source_control = controls_by_id[source_id]
            target_control = controls_by_id[target_id]
            source_mechanisms = set(control_mechanisms[source_id].keys())
            target_mechanisms = set(control_mechanisms[target_id].keys())
            union_count = max(len(source_mechanisms | target_mechanisms), 1)
            min_total = max(min(len(source_mechanisms), len(target_mechanisms)), 1)

            jaccard = len(shared_mechanism_ids) / union_count
            min_coverage = len(shared_mechanism_ids) / min_total
            confidence = round(
                min(
                    0.95,
                    0.55
                    + (0.25 * jaccard)
                    + (0.15 * min_coverage)
                    + (0.05 * min(len(shared_mechanism_ids), 3) / 3),
                ),
                2,
            )

            if len(shared_mechanism_ids) >= 2 and (jaccard >= 0.45 or min_coverage >= 0.8):
                mapping_type = ControlMapping.MappingType.EQUIVALENT
            elif len(shared_mechanism_ids) >= 2 or jaccard >= 0.25:
                mapping_type = ControlMapping.MappingType.PARTIAL
            else:
                mapping_type = ControlMapping.MappingType.SUPPORTS

            shared_names = sorted(
                control_mechanisms[source_id][mechanism_id]
                for mechanism_id in shared_mechanism_ids
            )
            mechanism_text = ", ".join(shared_names[:5])
            if len(shared_names) > 5:
                mechanism_text += f" (+{len(shared_names) - 5})"

            rationale = (
                f"{AUTO_RATIONALE_PREFIX} "
                f"{source_control.framework.name} {source_control.code} e "
                f"{target_control.framework.name} {target_control.code} partilham "
                f"{len(shared_names)} mecanismo(s): {mechanism_text}."
            )

            candidates.append(
                (
                    source_id,
                    target_id,
                    {
                        "mapping_type": mapping_type,
                        "confidence": confidence,
                        "rationale": rationale,
                    },
                )
            )

        return candidates