from ..models.asset import Asset
from ..models.risk import Risk, RiskAssessment, RiskFactor
from ..models.vulnerability import Vulnerability


class RiskEngineService:
    """
    Service to calculate risk scores based on ISO 27005 and ML-inspired logic.
    Simulates a predictive model (XGBoost) for vulnerability prioritization.
    """

    @classmethod
    def _risk_data(cls, asset: Asset, vulnerability: Vulnerability = None):
        cvss = float(vulnerability.cvss_score) if vulnerability and vulnerability.cvss_score else 5.0
        epss = float(vulnerability.epss_score) if vulnerability and vulnerability.epss_score else 0.1

        crit_map = {"Low": 1, "Medium": 2, "High": 3, "Critical": 5}
        asset_crit = crit_map.get(asset.criticality, 3)
        asset_exp = asset.exposure or 3
        asset_val = asset.business_value or 3
        asset_dep = asset.dependency_score or 3

        w_cvss = 0.35
        w_epss = 0.15
        w_crit = 0.25
        w_exp = 0.15
        w_other = 0.10

        n_cvss = (cvss / 10.0) * 100
        n_epss = epss * 100
        n_crit = (asset_crit / 5.0) * 100
        n_exp = (asset_exp / 5.0) * 100
        n_other = ((asset_val + asset_dep) / 10.0) * 100

        risk_score = (
            (w_cvss * n_cvss)
            + (w_epss * n_epss)
            + (w_crit * n_crit)
            + (w_exp * n_exp)
            + (w_other * n_other)
        )
        risk_score = min(100, max(0, risk_score))

        if risk_score >= 81:
            level = Risk.RiskLevel.CRITICAL
        elif risk_score >= 61:
            level = Risk.RiskLevel.HIGH
        elif risk_score >= 41:
            level = Risk.RiskLevel.MEDIUM
        elif risk_score >= 21:
            level = Risk.RiskLevel.LOW
        else:
            level = Risk.RiskLevel.VERY_LOW

        factors_text = []
        if cvss > 7.0:
            factors_text.append("severidade CVSS elevada")
        if epss > 0.5:
            factors_text.append("probabilidade de exploração (EPSS) ativa")
        if asset_crit >= 4:
            factors_text.append("elevada criticidade do ativo")
        if asset_exp >= 4:
            factors_text.append("exposição direta à rede pública")
        if asset_dep >= 4:
            factors_text.append("forte dependência de outros sistemas")

        if factors_text:
            explanation = f"Risco {level.label} ({int(risk_score)}/100) devido a: " + ", ".join(factors_text) + "."
        else:
            explanation = f"Risco calculado em {int(risk_score)}/100 baseado em fatores padrão de negócio."

        factors = [
            ("Severidade (CVSS)", cvss, w_cvss, n_cvss * w_cvss),
            ("Explorabilidade (EPSS)", epss, w_epss, n_epss * w_epss),
            ("Criticidade do Ativo", asset.criticality, w_crit, n_crit * w_crit),
            ("Exposição", asset_exp, w_exp, n_exp * w_exp),
            ("Valor e Dependência", (asset_val + asset_dep) / 2, w_other, n_other * w_other),
        ]

        return {
            "risk_score": risk_score,
            "risk_level": level,
            "likelihood": (n_cvss * 0.4 + n_epss * 0.6) / 20.0,
            "impact": (n_crit * 0.6 + n_other * 0.4) / 20.0,
            "ai_explanation": explanation,
            "factors": factors,
        }

    @classmethod
    def _replace_factors(cls, risk: Risk, factors):
        RiskFactor.objects.filter(risk=risk).delete()
        for name, value, weight, contribution in factors:
            RiskFactor.objects.create(
                risk=risk,
                name=name,
                value=str(value),
                weight=weight,
                contribution=contribution,
            )

    @classmethod
    def recalculate_risk(cls, risk: Risk) -> Risk:
        data = cls._risk_data(risk.asset, risk.vulnerability)
        risk.risk_score = data["risk_score"]
        risk.risk_level = data["risk_level"]
        risk.likelihood = data["likelihood"]
        risk.impact = data["impact"]
        risk.ai_explanation = data["ai_explanation"]
        risk.save(update_fields=["risk_score", "risk_level", "likelihood", "impact", "ai_explanation", "updated_at"])
        cls._replace_factors(risk, data["factors"])
        return risk

    @classmethod
    def calculate_risk(cls, asset: Asset, vulnerability: Vulnerability = None) -> Risk:
        data = cls._risk_data(asset, vulnerability)
        risk, _created = Risk.objects.update_or_create(
            asset=asset,
            vulnerability=vulnerability,
            defaults={
                "risk_score": data["risk_score"],
                "risk_level": data["risk_level"],
                "likelihood": data["likelihood"],
                "impact": data["impact"],
                "ai_explanation": data["ai_explanation"],
            },
        )
        cls._replace_factors(risk, data["factors"])
        return risk

    @classmethod
    def assess_asset(cls, asset: Asset):
        """
        Calculates an overall risk assessment for an asset by aggregating its risks.
        """
        risks = Risk.objects.filter(asset=asset, status="open")
        if not risks.exists():
            return None

        avg_score = sum(r.risk_score for r in risks) / risks.count()

        if avg_score >= 81:
            level = RiskAssessment.OverallLevel.CRITICAL
        elif avg_score >= 61:
            level = RiskAssessment.OverallLevel.HIGH
        elif avg_score >= 41:
            level = RiskAssessment.OverallLevel.MEDIUM
        elif avg_score >= 21:
            level = RiskAssessment.OverallLevel.LOW
        else:
            level = RiskAssessment.OverallLevel.VERY_LOW

        assessment, _created = RiskAssessment.objects.update_or_create(
            asset=asset,
            defaults={
                "overall_score": avg_score,
                "overall_level": level,
                "summary": f"Este ativo apresenta {risks.count()} riscos em aberto com uma média de severidade de {int(avg_score)}/100.",
                "recommendations": "Recomenda-se priorizar a correção das vulnerabilidades críticas e rever os controlos de exposição.",
            },
        )
        return assessment
