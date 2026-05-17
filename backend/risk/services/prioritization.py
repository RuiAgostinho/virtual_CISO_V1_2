import logging
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
from django.db.models import QuerySet
from django.utils.timezone import now
from django.conf import settings

from risk.models.asset import Asset
from risk.models.vulnerability import Vulnerability, AssetVulnerability

logger = logging.getLogger(__name__)

# --- CONFIGURATIONS ---
DEFAULT_RISK_WEIGHTS = getattr(settings, "VIRTUAL_CISO_RISK_WEIGHTS", {
    "cvss": 0.40,            
    "epss": 0.20,            
    "asset_criticality": 0.20,
    "exposure": 0.10,        
    "exploit": 0.10,         
})

DEFAULT_REMEDIATION_WEIGHTS = getattr(settings, "VIRTUAL_CISO_REMEDIATION_WEIGHTS", {
    "patchability": 0.70,    
    "age_urgency": 0.30,     
})

PRIORITY_FORMULA_WEIGHTS = getattr(settings, "VIRTUAL_CISO_PRIORITY_WEIGHTS", {
    "risk_ratio": 0.80,
    "remediation_ratio": 0.20,
})

CRITICALITY_SCOREMAP = {"critical": 1.0, "high": 0.8, "medium": 0.5, "low": 0.2}
EXPOSURE_SCOREMAP = {"external": 1.0, "dmz": 0.8, "internal": 0.4, "unknown": 0.5}

# --- DTOs (Data Transfer Objects) ---

@dataclass
class AssetDTO:
    id: str
    name: str
    criticality: str
    exposure_level: str

@dataclass
class RiskBreakdown:
    cvss: float
    epss: float
    asset_criticality: float
    exposure: float
    exploit_availability: float

@dataclass
class RemediationBreakdown:
    patch_actionability: float
    age_urgency_bonus: float

@dataclass
class PrioritizedVulnerabilityDTO:
    rank: int
    vulnerability_id: str
    occurrence_id: str
    cve_id: str
    title: str
    severity: str
    asset: AssetDTO
    
    risk_score: float
    remediation_score: float
    priority_score: float
    
    risk_breakdown: RiskBreakdown
    remediation_breakdown: RemediationBreakdown
    
    risk_reasons: List[str]
    remediation_reasons: List[str]
    priority_summary: str

    def to_dict(self):
        return asdict(self)


# --- CORE IMPLEMENTATION ---

class VulnerabilityScoringEngine:
    @staticmethod
    def _clamp(value: float, min_val: float, max_val: float) -> float:
        return max(min_val, min(value, max_val))

    @classmethod
    def calculate_scores(cls, asset_vuln: AssetVulnerability) -> Dict[str, Any]:
        """Calculates distinct risk_score, remediation_score and priority_score for an AssetVulnerability."""
        vuln = asset_vuln.vulnerability
        asset = asset_vuln.asset

        crit_str = (asset.criticality or "").lower()
        
        # Derive exposure from location or category since 'exposure_level' doesn't exist
        location = str(asset.location or "").lower()
        category = str(asset.category or "").lower()
        exp_str = "unknown"
        if "external" in location or "dmz" in location or category in ["gateway", "firewall"]:
            exp_str = "external"
        elif "internal" in location or category in ["workstation", "laptop"]:
            exp_str = "internal"

        # =========== 1. RISK DOMAIN ===========
        safe_cvss = cls._clamp(float(vuln.cvss_score) if vuln.cvss_score else 0.0, 0.0, 10.0)
        cvss_comp = (safe_cvss / 10.0) * (DEFAULT_RISK_WEIGHTS["cvss"] * 100)

        safe_epss = cls._clamp(float(vuln.epss_score) if vuln.epss_score else 0.0, 0.0, 1.0)
        epss_comp = safe_epss * (DEFAULT_RISK_WEIGHTS["epss"] * 100)

        crit_comp = CRITICALITY_SCOREMAP.get(crit_str, 0.5) * (DEFAULT_RISK_WEIGHTS["asset_criticality"] * 100)
        exp_comp = EXPOSURE_SCOREMAP.get(exp_str, 0.5) * (DEFAULT_RISK_WEIGHTS["exposure"] * 100)
        exploit_comp = (DEFAULT_RISK_WEIGHTS["exploit"] * 100) if getattr(vuln, 'is_in_kev', False) else 0.0

        risk_bd = {
            "cvss": round(cvss_comp, 2),
            "epss": round(epss_comp, 2),
            "asset_criticality": round(crit_comp, 2),
            "exposure": round(exp_comp, 2),
            "exploit_availability": round(exploit_comp, 2),
        }
        risk_score = round(cls._clamp(sum(risk_bd.values()), 0.0, 100.0), 2)

        # =========== 2. REMEDIATION DOMAIN ===========
        has_mitigation = bool(vuln.mitigation and len(vuln.mitigation.strip()) > 5)
        patch_comp = (DEFAULT_REMEDIATION_WEIGHTS["patchability"] * 100) if has_mitigation else 0.0
        
        age_bonus = 0.0
        if getattr(asset_vuln, 'first_detected', None):
            delta_days = max(0, (now() - asset_vuln.first_detected).days)
            age_factor = min(30.0, delta_days) / 30.0 
            age_bonus = age_factor * (DEFAULT_REMEDIATION_WEIGHTS["age_urgency"] * 100)

        remediation_bd = {
            "patch_actionability": round(patch_comp, 2),
            "age_urgency_bonus": round(age_bonus, 2),
        }
        remediation_score = round(cls._clamp(sum(remediation_bd.values()), 0.0, 100.0), 2)

        # =========== 3. PRIORITY DECISION DOMAIN ===========
        priority_score = (
            (risk_score * PRIORITY_FORMULA_WEIGHTS["risk_ratio"]) + 
            (remediation_score * PRIORITY_FORMULA_WEIGHTS["remediation_ratio"])
        )
        priority_score = round(cls._clamp(priority_score, 0.0, 100.0), 2)

        # --- REASON SYNTHESIS ---
        r_reasons = []
        if crit_comp >= 16: r_reasons.append("Afeta infraestrutura crítica")
        if exploit_comp > 0: r_reasons.append("CISA KEV: Exploit conhecido ativo")
        if safe_epss > 0.60: r_reasons.append(f"Alta probabilidade (EPSS {int(safe_epss*100)}%) de ataque imanente")
        if exp_str in ["external", "dmz"]: r_reasons.append("Superfície exposta externamente")

        rem_reasons = []
        if patch_comp > 0: rem_reasons.append("Mitigação detalhada/Patch disponível")
        if age_bonus > 15: rem_reasons.append(f"Vulnerabilidade esquecida há mais de {min(30, getattr(asset_vuln, 'first_detected', now()).day)} dias")

        if not r_reasons: r_reasons.append("Vulnerabilidade de risco basal")
        if not rem_reasons: rem_reasons.append("Mitigação complexa/Sem patch óbvio devolvido")

        priority_summary = (
            f"Prioridade baseada em {'Ameaça Severa' if risk_score > 70 else 'Risco Moderado'} "
            f"com {'Fácil Resolução' if remediation_score > 50 else 'Mitigação Morosa'}."
        )

        return {
            "risk_score": risk_score,
            "remediation_score": remediation_score,
            "priority_score": priority_score,
            "risk_breakdown": risk_bd,
            "remediation_breakdown": remediation_bd,
            "risk_reasons": r_reasons,
            "remediation_reasons": rem_reasons,
            "priority_summary": priority_summary,
            "derived_exposure": exp_str
        }


class VulnerabilityPrioritizationService:
    @classmethod
    def get_top_vulnerabilities(cls, limit: int = 5, filters: Optional[dict] = None) -> List[PrioritizedVulnerabilityDTO]:
        logger.info(f"Applying Vulnerability Risk Prioritization [Limit: {limit}]")
        
        # Base query on the through table AssetVulnerability
        qs = AssetVulnerability.objects.select_related("asset", "vulnerability")
        
        if not filters or "status" not in filters:
            qs = qs.filter(status__iexact="open")
            
        qs = cls._apply_filters(qs, filters)
        
        vulns_list = list(qs[:5000])
        
        if not vulns_list:
            return []

        scored_candidates = []
        for asset_vuln in vulns_list:
            try:
                score_data = VulnerabilityScoringEngine.calculate_scores(asset_vuln)
                scored_candidates.append((asset_vuln, score_data))
            except Exception as e:
                logger.error(f"[PRIORITIZATION_ENGINE] Skipped AssetVulnerability {asset_vuln.id}: {e}")
                continue

        scored_candidates.sort(key=lambda x: x[1]["priority_score"], reverse=True)

        return cls._build_dto_array(scored_candidates, limit)

    @classmethod
    def _apply_filters(cls, qs: QuerySet, filters: Optional[dict]) -> QuerySet:
        if not filters:
            return qs
            
        if asset_id := filters.get("asset_id"): qs = qs.filter(asset_id=asset_id)
        if crit := filters.get("asset_criticality"): qs = qs.filter(asset__criticality__iexact=crit)
        if severity := filters.get("severity"): qs = qs.filter(vulnerability__severity__iexact=severity)
        if status := filters.get("status"): qs = qs.filter(status__iexact=status)
        if source := filters.get("source"): qs = qs.filter(source__iexact=source)
        if filters.get("only_known_exploited"): qs = qs.filter(vulnerability__is_in_kev=True)
            
        return qs

    @classmethod
    def _build_dto_array(cls, scored_candidates: list, limit: int) -> List[PrioritizedVulnerabilityDTO]:
        results = []
        for rank, (asset_vuln, sd) in enumerate(scored_candidates[:limit], start=1):
            vuln = asset_vuln.vulnerability
            asset = asset_vuln.asset

            asset_dto = AssetDTO(
                id=str(asset.id),
                name=asset.name or "Unnamed",
                criticality=asset.criticality or "unknown",
                exposure_level=sd.get("derived_exposure", "unknown")
            )

            d = PrioritizedVulnerabilityDTO(
                rank=rank,
                vulnerability_id=str(vuln.id),
                occurrence_id=str(asset_vuln.id),
                cve_id=getattr(vuln, "cve_id", None) or "Undisclosed CVE",
                title=getattr(vuln, "title", None) or "Vulnerability Descriptor Missing", # Note: Vulnerability missing title field physically, fallback will apply
                severity=getattr(vuln, "severity", None) or "unknown",
                asset=asset_dto,
                
                risk_score=sd["risk_score"],
                remediation_score=sd["remediation_score"],
                priority_score=sd["priority_score"],
                
                risk_breakdown=RiskBreakdown(**sd["risk_breakdown"]),
                remediation_breakdown=RemediationBreakdown(**sd["remediation_breakdown"]),
                
                risk_reasons=sd["risk_reasons"],
                remediation_reasons=sd["remediation_reasons"],
                priority_summary=sd["priority_summary"]
            )
            results.append(d)
            
        return results


class VulnerabilityContextBuilder:
    @staticmethod
    def build_llm_context(dtos: List[PrioritizedVulnerabilityDTO]) -> str:
        if not dtos:
            return "Nenhuma vulnerabilidade crítica detetada."

        context_lines = [
            "### DADOS DETERMINÍSTICOS - PRIORIZAÇÃO DE VULNERABILIDADES (MATRIZ DECISIONAL) ###",
            "Atenção CISO AI: Estes cálculos representam o Ranking de Prioridade Absoluta.",
            ""
        ]

        for dto in dtos:
            ctx = (
                f"Rank #{dto.rank} | {dto.cve_id}\n"
                f"   - Score de Prioridade Final: {dto.priority_score}/100\n"
                f"   - O quê (Risco): Score {dto.risk_score}/100 -> {' | '.join(dto.risk_reasons)}\n"
                f"   - Como (Remediação): Score {dto.remediation_score}/100 -> {' | '.join(dto.remediation_reasons)}\n"
                f"   - Ativo Afetado: {dto.asset.name} (Criticidade: {dto.asset.criticality.upper()})\n"
                f"   - Resumo Executivo: {dto.priority_summary}\n"
            )
            context_lines.append(ctx)

        context_lines.append("### FIM DA INFORMAÇÃO PRIORIZADA ###")
        return "\n".join(context_lines)


