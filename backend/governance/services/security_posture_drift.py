from datetime import timedelta
from decimal import Decimal

from django.apps import apps
from django.db.models import Count, Q
from django.utils import timezone

from governance.models import (
    Control,
    ControlAssessment,
    ControlAssessmentSnapshot,
    InternalControlFrameworkMapping,
)


class SecurityPostureDriftService:
    """Detecta regressões entre a última fotografia auditável e o estado atual.

    A lógica é deliberadamente determinística: o LLM pode resumir estes dados,
    mas a prova de regressão vem da BD e dos snapshots persistidos.
    """

    STATUS_RANK = {
        ControlAssessment.ImplementationStatus.NOT_STARTED: 0,
        ControlAssessment.ImplementationStatus.PLANNED: 1,
        ControlAssessment.ImplementationStatus.PARTIAL: 2,
        ControlAssessment.ImplementationStatus.IMPLEMENTED: 3,
        ControlAssessment.ImplementationStatus.OPTIMIZED: 4,
    }
    LIMIT = 15

    @classmethod
    def create_current_snapshot(cls, label="", snapshot_type=None, user=None):
        captured_at = timezone.now()
        snapshot_type = snapshot_type or ControlAssessmentSnapshot.SnapshotType.MANUAL
        assessments = ControlAssessment.objects.select_related("profile", "control", "control__framework").all()

        created = 0
        for assessment in assessments:
            ControlAssessmentSnapshot.from_assessment(
                assessment,
                snapshot_label=label or f"Snapshot {captured_at:%Y-%m-%d %H:%M}",
                snapshot_type=snapshot_type,
                user=user,
                captured_at=captured_at,
            )
            created += 1

        return {
            "created": created,
            "captured_at": captured_at.isoformat(),
            "snapshot_label": label,
            "snapshot_type": snapshot_type,
        }

    @classmethod
    def create_demo_regression(cls, user=None):
        """Cria uma regressão controlada para demonstração, sem depender da linha de comandos.

        O método usa um ControlAssessment real da BD, guarda uma fotografia anterior
        "boa" e degrada o estado atual desse mesmo assessment. Assim a demo continua
        rastreável e reversível por auditoria, sem hardcoding no frontend.
        """
        assessment = (
            ControlAssessment.objects
            .select_related("profile", "control", "control__framework")
            .order_by("control__framework__code", "control__code")
            .first()
        )
        if not assessment:
            return {
                "created": False,
                "message": "Não existem avaliações de controlos para simular regressão.",
            }

        snapshot = ControlAssessmentSnapshot.from_assessment(
            assessment,
            snapshot_label="Auditoria anterior - cenário demo",
            snapshot_type=ControlAssessmentSnapshot.SnapshotType.DEMO,
            user=user,
            captured_at=timezone.now(),
        )
        snapshot.implementation_status = ControlAssessment.ImplementationStatus.IMPLEMENTED
        snapshot.maturity_level = max(snapshot.maturity_level, 4)
        snapshot.effectiveness = Decimal("0.90")
        snapshot.risk_residual = Decimal("0.20")
        snapshot.notes = "Snapshot demo: controlo considerado implementado na auditoria anterior."
        snapshot.save()

        assessment.implementation_status = ControlAssessment.ImplementationStatus.NOT_STARTED
        assessment.maturity_level = 1
        assessment.effectiveness = Decimal("0.20")
        assessment.risk_residual = Decimal("0.80")
        assessment.notes = (
            f"{assessment.notes}\n"
            "Cenário demo de drift: controlo degradado para testar regressão de conformidade."
        ).strip()
        assessment.assessed_at = timezone.now()
        assessment.assessed_by = getattr(user, "username", "") or "frontend_demo_drift"
        assessment.save()

        return {
            "created": True,
            "assessment_id": str(assessment.id),
            "control_id": str(assessment.control_id),
            "control_code": assessment.control.code,
            "control_title": assessment.control.title,
            "framework": cls._framework_payload(assessment.control.framework),
            "snapshot_id": str(snapshot.id),
            "message": "Cenário demo criado. A página já pode detetar uma regressão de controlo.",
        }

    @classmethod
    def create_demo_improvement(cls, user=None):
        assessment = (
            ControlAssessment.objects
            .select_related("profile", "control", "control__framework")
            .order_by("control__framework__code", "control__code")
            .first()
        )
        if not assessment:
            return {
                "created": False,
                "message": "Nao existem avaliacoes de controlos para simular melhoria.",
            }

        snapshot = ControlAssessmentSnapshot.from_assessment(
            assessment,
            snapshot_label="Auditoria anterior - melhoria demo",
            snapshot_type=ControlAssessmentSnapshot.SnapshotType.DEMO,
            user=user,
            captured_at=timezone.now(),
        )
        snapshot.implementation_status = ControlAssessment.ImplementationStatus.PARTIAL
        snapshot.maturity_level = 2
        snapshot.effectiveness = Decimal("0.35")
        snapshot.risk_residual = Decimal("0.75")
        snapshot.notes = "Snapshot demo: controlo parcialmente implementado na auditoria anterior."
        snapshot.save()

        assessment.implementation_status = ControlAssessment.ImplementationStatus.OPTIMIZED
        assessment.maturity_level = 5
        assessment.effectiveness = Decimal("0.95")
        assessment.risk_residual = Decimal("0.10")
        assessment.notes = (
            f"{assessment.notes}\n"
            "Cenario demo de drift: controlo melhorado para testar melhoria de postura."
        ).strip()
        assessment.assessed_at = timezone.now()
        assessment.assessed_by = getattr(user, "username", "") or "frontend_demo_drift"
        assessment.save()

        return {
            "created": True,
            "assessment_id": str(assessment.id),
            "control_id": str(assessment.control_id),
            "control_code": assessment.control.code,
            "control_title": assessment.control.title,
            "framework": cls._framework_payload(assessment.control.framework),
            "snapshot_id": str(snapshot.id),
            "message": "Cenario demo criado. A pagina ja pode detetar uma melhoria de controlo.",
        }

    @classmethod
    def overview(cls, since=None):
        latest_snapshots = cls._latest_control_snapshots()
        baseline_at = cls._baseline_time(latest_snapshots, since)
        control_regressions = cls._control_regressions(latest_snapshots)
        control_improvements = cls._control_improvements(latest_snapshots)
        asset_exposure_regressions = cls._asset_exposure_regressions()
        asset_exposure_improvements = cls._asset_exposure_improvements()
        new_vulnerabilities = cls._new_vulnerabilities(baseline_at)
        framework_mapping_gaps = cls._framework_mapping_gaps()

        risk_events = control_regressions + asset_exposure_regressions + new_vulnerabilities
        positive_events = control_improvements + asset_exposure_improvements
        all_events = risk_events + positive_events
        severity_counts = cls._severity_counts(risk_events)
        summary = cls._summary(
            control_regressions,
            asset_exposure_regressions,
            new_vulnerabilities,
            control_improvements,
            asset_exposure_improvements,
        )

        return {
            "generated_at": timezone.now().isoformat(),
            "baseline": {
                "captured_at": baseline_at.isoformat() if baseline_at else None,
                "snapshots": len(latest_snapshots),
                "source": "latest_control_assessment_snapshot" if latest_snapshots else "fallback_30_days",
            },
            "metrics": {
                "total_events": len(all_events),
                "negative_events": len(risk_events),
                "positive_events": len(positive_events),
                "critical": severity_counts["critical"],
                "high": severity_counts["high"],
                "medium": severity_counts["medium"],
                "low": severity_counts["low"],
                "control_regressions": len(control_regressions),
                "control_improvements": len(control_improvements),
                "asset_exposure_regressions": len(asset_exposure_regressions),
                "asset_exposure_improvements": len(asset_exposure_improvements),
                "new_vulnerabilities": len(new_vulnerabilities),
                "framework_mapping_gaps": len(framework_mapping_gaps),
            },
            "summary": summary,
            "control_regressions": control_regressions[: cls.LIMIT],
            "control_improvements": control_improvements[: cls.LIMIT],
            "asset_exposure_regressions": asset_exposure_regressions[: cls.LIMIT],
            "asset_exposure_improvements": asset_exposure_improvements[: cls.LIMIT],
            "new_vulnerabilities": new_vulnerabilities[: cls.LIMIT],
            "framework_mapping_gaps": framework_mapping_gaps[: cls.LIMIT],
            "recommendations": cls._recommendations(
                control_regressions,
                asset_exposure_regressions,
                new_vulnerabilities,
                framework_mapping_gaps,
                control_improvements,
                asset_exposure_improvements,
            ),
        }

    @classmethod
    def _latest_control_snapshots(cls):
        snapshots = (
            ControlAssessmentSnapshot.objects
            .select_related("assessment", "profile", "control", "control__framework")
            .order_by("assessment_id", "-captured_at")
        )
        latest = {}
        for snapshot in snapshots:
            latest.setdefault(snapshot.assessment_id, snapshot)
        return latest

    @classmethod
    def _baseline_time(cls, latest_snapshots, since=None):
        if since:
            return since
        if latest_snapshots:
            return max(snapshot.captured_at for snapshot in latest_snapshots.values())
        return timezone.now() - timedelta(days=30)

    @classmethod
    def _control_regressions(cls, latest_snapshots):
        if not latest_snapshots:
            return []

        current_assessments = (
            ControlAssessment.objects
            .select_related("profile", "control", "control__framework")
            .filter(id__in=latest_snapshots.keys())
        )
        regressions = []
        for assessment in current_assessments:
            previous = latest_snapshots.get(assessment.id)
            if not previous:
                continue
            event = cls._control_regression_event(previous, assessment)
            if event:
                regressions.append(event)
        return sorted(regressions, key=lambda item: (cls._severity_rank(item["severity"]), -item["impact_score"]))

    @classmethod
    def _control_improvements(cls, latest_snapshots):
        if not latest_snapshots:
            return []

        current_assessments = (
            ControlAssessment.objects
            .select_related("profile", "control", "control__framework")
            .filter(id__in=latest_snapshots.keys())
        )
        improvements = []
        for assessment in current_assessments:
            previous = latest_snapshots.get(assessment.id)
            if not previous:
                continue
            if cls._control_regression_event(previous, assessment):
                continue
            event = cls._control_improvement_event(previous, assessment)
            if event:
                improvements.append(event)
        return sorted(improvements, key=lambda item: -item["impact_score"])

    @classmethod
    def _control_regression_event(cls, previous, current):
        previous_rank = cls.STATUS_RANK.get(previous.implementation_status, 0)
        current_rank = cls.STATUS_RANK.get(current.implementation_status, 0)
        effectiveness_delta = float(current.effectiveness) - float(previous.effectiveness)
        residual_delta = float(current.risk_residual) - float(previous.risk_residual)

        status_regressed = current_rank < previous_rank
        effectiveness_regressed = effectiveness_delta <= -0.05
        residual_regressed = residual_delta >= 0.05
        if not (status_regressed or effectiveness_regressed or residual_regressed):
            return None

        severity = cls._control_severity(current.control, previous_rank - current_rank, residual_delta)
        framework = current.control.framework
        return {
            "type": "control_regression",
            "severity": severity,
            "impact_score": cls._impact_score(severity, previous_rank - current_rank, residual_delta),
            "assessment_id": str(current.id),
            "control_id": str(current.control_id),
            "control_code": current.control.code,
            "control_title": current.control.title,
            "framework": cls._framework_payload(framework),
            "previous": {
                "snapshot_id": str(previous.id),
                "snapshot_label": previous.snapshot_label,
                "captured_at": previous.captured_at.isoformat(),
                "implementation_status": previous.implementation_status,
                "maturity_level": previous.maturity_level,
                "effectiveness": float(previous.effectiveness),
                "risk_residual": float(previous.risk_residual),
            },
            "current": {
                "implementation_status": current.implementation_status,
                "maturity_level": current.maturity_level,
                "effectiveness": float(current.effectiveness),
                "risk_residual": float(current.risk_residual),
                "assessed_at": current.assessed_at.isoformat() if current.assessed_at else None,
            },
            "reasons": cls._control_reasons(
                status_regressed,
                effectiveness_regressed,
                residual_regressed,
                previous,
                current,
            ),
            "recommendation": (
                "Investigar a causa da regressão, restaurar o mecanismo de controlo e recolher evidência "
                "antes da próxima avaliação formal."
            ),
        }

    @classmethod
    def _control_improvement_event(cls, previous, current):
        previous_rank = cls.STATUS_RANK.get(previous.implementation_status, 0)
        current_rank = cls.STATUS_RANK.get(current.implementation_status, 0)
        effectiveness_delta = float(current.effectiveness) - float(previous.effectiveness)
        residual_delta = float(current.risk_residual) - float(previous.risk_residual)

        status_improved = current_rank > previous_rank
        effectiveness_improved = effectiveness_delta >= 0.05
        residual_improved = residual_delta <= -0.05
        if not (status_improved or effectiveness_improved or residual_improved):
            return None

        framework = current.control.framework
        return {
            "type": "control_improvement",
            "severity": "low",
            "impact_score": cls._improvement_score(current_rank - previous_rank, effectiveness_delta, residual_delta),
            "assessment_id": str(current.id),
            "control_id": str(current.control_id),
            "control_code": current.control.code,
            "control_title": current.control.title,
            "framework": cls._framework_payload(framework),
            "previous": {
                "snapshot_id": str(previous.id),
                "snapshot_label": previous.snapshot_label,
                "captured_at": previous.captured_at.isoformat(),
                "implementation_status": previous.implementation_status,
                "maturity_level": previous.maturity_level,
                "effectiveness": float(previous.effectiveness),
                "risk_residual": float(previous.risk_residual),
            },
            "current": {
                "implementation_status": current.implementation_status,
                "maturity_level": current.maturity_level,
                "effectiveness": float(current.effectiveness),
                "risk_residual": float(current.risk_residual),
                "assessed_at": current.assessed_at.isoformat() if current.assessed_at else None,
            },
            "reasons": cls._control_improvement_reasons(
                status_improved,
                effectiveness_improved,
                residual_improved,
                previous,
                current,
            ),
            "recommendation": (
                "Registar a evidencia que sustenta a melhoria e atualizar o baseline quando a alteracao "
                "for aceite pela validacao humana."
            ),
        }

    @classmethod
    def _control_reasons(cls, status_regressed, effectiveness_regressed, residual_regressed, previous, current):
        reasons = []
        if status_regressed:
            reasons.append(
                f"Estado passou de {previous.implementation_status} para {current.implementation_status}."
            )
        if effectiveness_regressed:
            reasons.append(
                f"Efetividade desceu de {float(previous.effectiveness):.2f} para {float(current.effectiveness):.2f}."
            )
        if residual_regressed:
            reasons.append(
                f"Risco residual subiu de {float(previous.risk_residual):.2f} para {float(current.risk_residual):.2f}."
            )
        return reasons

    @classmethod
    def _control_improvement_reasons(cls, status_improved, effectiveness_improved, residual_improved, previous, current):
        reasons = []
        if status_improved:
            reasons.append(
                f"Estado passou de {previous.implementation_status} para {current.implementation_status}."
            )
        if effectiveness_improved:
            reasons.append(
                f"Efetividade subiu de {float(previous.effectiveness):.2f} para {float(current.effectiveness):.2f}."
            )
        if residual_improved:
            reasons.append(
                f"Risco residual desceu de {float(previous.risk_residual):.2f} para {float(current.risk_residual):.2f}."
            )
        return reasons

    @classmethod
    def _asset_exposure_regressions(cls):
        AssetExposureSnapshot = apps.get_model("risk", "AssetExposureSnapshot")
        snapshots = (
            AssetExposureSnapshot.objects
            .select_related("asset")
            .order_by("asset_id", "-captured_at")
        )
        by_asset = {}
        for snapshot in snapshots:
            entries = by_asset.setdefault(snapshot.asset_id, [])
            if len(entries) < 2:
                entries.append(snapshot)

        events = []
        for entries in by_asset.values():
            if len(entries) < 2:
                continue
            latest, previous = entries[0], entries[1]
            new_ports = sorted(cls._ports(latest.open_ports) - cls._ports(previous.open_ports))
            score_delta = int(latest.exposure_score or 0) - int(previous.exposure_score or 0)
            if score_delta <= 0 and not new_ports:
                continue
            severity = "high" if score_delta >= 2 or any(port in {22, 3389, 445, 1433, 3306} for port in new_ports) else "medium"
            events.append(
                {
                    "type": "asset_exposure_regression",
                    "severity": severity,
                    "impact_score": cls._impact_score(severity, score_delta, 0),
                    "asset_id": str(latest.asset_id),
                    "asset_name": latest.asset.name,
                    "previous": {
                        "snapshot_id": str(previous.id),
                        "captured_at": previous.captured_at.isoformat(),
                        "exposure_score": previous.exposure_score,
                        "open_ports": previous.open_ports,
                    },
                    "current": {
                        "snapshot_id": str(latest.id),
                        "captured_at": latest.captured_at.isoformat(),
                        "exposure_score": latest.exposure_score,
                        "open_ports": latest.open_ports,
                    },
                    "new_ports": new_ports,
                    "recommendation": "Validar se a exposição é esperada, fechar portas desnecessárias ou registar exceção aprovada.",
                }
            )
        return sorted(events, key=lambda item: (cls._severity_rank(item["severity"]), -item["impact_score"]))

    @classmethod
    def _asset_exposure_improvements(cls):
        AssetExposureSnapshot = apps.get_model("risk", "AssetExposureSnapshot")
        snapshots = (
            AssetExposureSnapshot.objects
            .select_related("asset")
            .order_by("asset_id", "-captured_at")
        )
        by_asset = {}
        for snapshot in snapshots:
            entries = by_asset.setdefault(snapshot.asset_id, [])
            if len(entries) < 2:
                entries.append(snapshot)

        events = []
        for entries in by_asset.values():
            if len(entries) < 2:
                continue
            latest, previous = entries[0], entries[1]
            new_ports = sorted(cls._ports(latest.open_ports) - cls._ports(previous.open_ports))
            closed_ports = sorted(cls._ports(previous.open_ports) - cls._ports(latest.open_ports))
            score_delta = int(latest.exposure_score or 0) - int(previous.exposure_score or 0)
            if score_delta > 0 or new_ports:
                continue
            if score_delta >= 0 and not closed_ports:
                continue
            events.append(
                {
                    "type": "asset_exposure_improvement",
                    "severity": "low",
                    "impact_score": min(
                        100,
                        cls._improvement_score(abs(score_delta), 0, 0) + len(closed_ports) * 4,
                    ),
                    "asset_id": str(latest.asset_id),
                    "asset_name": latest.asset.name,
                    "previous": {
                        "snapshot_id": str(previous.id),
                        "captured_at": previous.captured_at.isoformat(),
                        "exposure_score": previous.exposure_score,
                        "open_ports": previous.open_ports,
                    },
                    "current": {
                        "snapshot_id": str(latest.id),
                        "captured_at": latest.captured_at.isoformat(),
                        "exposure_score": latest.exposure_score,
                        "open_ports": latest.open_ports,
                    },
                    "closed_ports": closed_ports,
                    "recommendation": "Registar a mudanca tecnica, associar evidencia e atualizar o baseline se a reducao for permanente.",
                }
            )
        return sorted(events, key=lambda item: -item["impact_score"])

    @classmethod
    def _new_vulnerabilities(cls, since):
        AssetVulnerability = apps.get_model("risk", "AssetVulnerability")
        occurrences = (
            AssetVulnerability.objects
            .select_related("asset", "vulnerability")
            .filter(first_detected__gte=since)
            .exclude(status__in=["Resolved", "False positive"])
            .order_by("-vulnerability__is_in_kev", "-vulnerability__cvss_score", "-first_detected")[: cls.LIMIT]
        )
        events = []
        for occurrence in occurrences:
            vulnerability = occurrence.vulnerability
            cvss = float(vulnerability.cvss_score or 0)
            severity = "critical" if vulnerability.is_in_kev or cvss >= 9 else "high" if cvss >= 7 else "medium"
            events.append(
                {
                    "type": "new_vulnerability",
                    "severity": severity,
                    "impact_score": cls._impact_score(severity, cvss, 0),
                    "occurrence_id": str(occurrence.id),
                    "asset_id": str(occurrence.asset_id),
                    "asset_name": occurrence.asset.name,
                    "vulnerability_id": str(vulnerability.id),
                    "cve_id": vulnerability.cve_id,
                    "title": cls._vulnerability_title(vulnerability),
                    "cvss_score": cvss,
                    "epss_score": float(vulnerability.epss_score) if vulnerability.epss_score is not None else None,
                    "is_in_kev": vulnerability.is_in_kev,
                    "first_detected": occurrence.first_detected.isoformat(),
                    "status": occurrence.status,
                    "recommendation": "Priorizar no painel de vulnerabilidades e confirmar mitigação com controlos/mecanismos associados.",
                }
            )
        return events

    @classmethod
    def _framework_mapping_gaps(cls):
        mapped_control_ids = (
            InternalControlFrameworkMapping.objects
            .filter(validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED)
            .values_list("framework_control_id", flat=True)
            .distinct()
        )
        controls = (
            Control.objects
            .select_related("framework")
            .filter(status=Control.Status.ACTIVE)
            .exclude(id__in=mapped_control_ids)
            .filter(Q(framework__code__icontains="NIS") | Q(framework__name__icontains="NIS") | Q(framework__code__icontains="ISO") | Q(framework__name__icontains="27001"))
            .order_by("framework__code", "code")[: cls.LIMIT]
        )
        return [
            {
                "type": "framework_mapping_gap",
                "severity": "high" if cls._is_nis2(control.framework) or control.is_mandatory else "medium",
                "impact_score": 75 if cls._is_nis2(control.framework) or control.is_mandatory else 50,
                "control_id": str(control.id),
                "control_code": control.code,
                "control_title": control.title,
                "framework": cls._framework_payload(control.framework),
                "recommendation": "Criar ou aprovar mapping para um controlo interno antes de considerar cobertura oficial.",
            }
            for control in controls
        ]

    @staticmethod
    def _ports(value):
        ports = set()
        if not isinstance(value, list):
            return ports
        for item in value:
            if isinstance(item, dict):
                candidate = item.get("port") or item.get("number") or item.get("id")
            else:
                candidate = item
            try:
                ports.add(int(candidate))
            except (TypeError, ValueError):
                continue
        return ports

    @classmethod
    def _control_severity(cls, control, rank_delta, residual_delta):
        if cls._is_nis2(control.framework) and (rank_delta >= 1 or residual_delta >= 0.1):
            return "critical"
        if control.is_mandatory or cls._is_iso(control.framework):
            return "high"
        return "medium"

    @staticmethod
    def _is_nis2(framework):
        text = f"{framework.code} {framework.name} {framework.version}".lower()
        return "nis2" in text or "nis 2" in text or "125/2025" in text or "dl 125" in text

    @staticmethod
    def _is_iso(framework):
        text = f"{framework.code} {framework.name} {framework.version}".lower()
        return "iso" in text or "27001" in text or "27002" in text

    @staticmethod
    def _impact_score(severity, primary_delta, residual_delta):
        base = {"critical": 95, "high": 75, "medium": 50, "low": 25}.get(severity, 25)
        return min(100, round(base + max(0, float(primary_delta or 0)) * 3 + max(0, float(residual_delta or 0)) * 20, 1))

    @staticmethod
    def _improvement_score(rank_delta, effectiveness_delta, residual_delta):
        return min(
            100,
            round(
                35
                + max(0, float(rank_delta or 0)) * 8
                + max(0, float(effectiveness_delta or 0)) * 35
                + max(0, -float(residual_delta or 0)) * 35,
                1,
            ),
        )

    @staticmethod
    def _severity_rank(severity):
        return {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(severity, 9)

    @staticmethod
    def _severity_counts(events):
        counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for event in events:
            severity = event.get("severity")
            if severity in counts:
                counts[severity] += 1
        return counts

    @staticmethod
    def _framework_payload(framework):
        return {
            "id": str(framework.id),
            "code": framework.code,
            "name": framework.name,
            "version": framework.version,
        }

    @staticmethod
    def _vulnerability_title(vulnerability):
        return (
            getattr(vulnerability, "title", None)
            or getattr(vulnerability, "name", None)
            or getattr(vulnerability, "cve_id", None)
            or str(vulnerability)
        )

    @classmethod
    def _summary(
        cls,
        control_regressions,
        asset_exposure_regressions,
        new_vulnerabilities,
        control_improvements,
        asset_exposure_improvements,
    ):
        negative_parts = []
        positive_parts = []
        if control_regressions:
            negative_parts.append(f"{len(control_regressions)} regressoes de controlos")
        if asset_exposure_regressions:
            negative_parts.append(f"{len(asset_exposure_regressions)} aumentos de exposicao")
        if new_vulnerabilities:
            negative_parts.append(f"{len(new_vulnerabilities)} vulnerabilidades novas/recentes")
        if control_improvements:
            positive_parts.append(f"{len(control_improvements)} melhorias de controlos")
        if asset_exposure_improvements:
            positive_parts.append(f"{len(asset_exposure_improvements)} reducoes de exposicao")

        if negative_parts and positive_parts:
            return (
                "Foram detetados sinais de possivel degradacao: "
                + ", ".join(negative_parts)
                + ". Tambem ha melhoria mensuravel: "
                + ", ".join(positive_parts)
                + "."
            )
        if negative_parts:
            return "Foram detetados sinais de possivel degradacao: " + ", ".join(negative_parts) + "."
        if positive_parts:
            return "Foram detetadas melhorias materiais face a ultima fotografia: " + ", ".join(positive_parts) + "."
        return "Nao foi detetado drift material face a ultima fotografia disponivel."

    @classmethod
    def _recommendations(
        cls,
        control_regressions,
        asset_exposure_regressions,
        new_vulnerabilities,
        mapping_gaps,
        control_improvements=None,
        asset_exposure_improvements=None,
    ):
        recommendations = []
        if control_regressions:
            recommendations.append("Rever primeiro as regressoes de controlos criticos ou associados a NIS2/ISO.")
        if asset_exposure_regressions:
            recommendations.append("Validar alteracoes de exposicao tecnica e confirmar se foram autorizadas.")
        if new_vulnerabilities:
            recommendations.append("Enviar vulnerabilidades novas para a priorizacao contextual e associar acoes de mitigacao.")
        if mapping_gaps:
            recommendations.append("Completar mappings em frameworks criticas para nao perder cobertura normativa.")
        if control_improvements or asset_exposure_improvements:
            recommendations.append("Preservar evidencia das melhorias e atualizar o baseline apenas depois de validacao humana.")
        if not recommendations:
            recommendations.append("Criar um snapshot antes da proxima auditoria para tornar a comparacao temporal mais robusta.")
        return recommendations

    @classmethod
    def overview_counts(cls):
        payload = cls.overview()
        return payload["metrics"]
