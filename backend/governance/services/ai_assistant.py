import unicodedata

from django.db.models import Q

from governance.models import Control, InternalControl, Policy, PolicyControl, PolicyInternalControl


STOP_WORDS = {
    "para",
    "com",
    "sem",
    "uma",
    "por",
    "dos",
    "das",
    "the",
    "and",
    "that",
    "este",
    "esta",
    "policy",
    "politica",
    "control",
    "controlo",
    "security",
    "seguranca",
    "informacao",
    "gestao",
    "management",
}


DOMAIN_HINTS = [
    {
        "terms": ["acesso", "access", "identidade", "autenticacao", "privileg"],
        "codes": ["IC-AC"],
    },
    {
        "terms": ["risco", "risk"],
        "codes": ["IC-RISK"],
    },
    {
        "terms": ["incidente", "incident", "resposta"],
        "codes": ["IC-INC"],
    },
    {
        "terms": ["ativo", "asset", "inventario", "classificacao"],
        "codes": ["IC-ASSET"],
    },
    {
        "terms": ["vulnerab", "patch", "scan"],
        "codes": ["IC-VULN"],
    },
    {
        "terms": ["continuidade", "backup", "recuperacao", "recovery"],
        "codes": ["IC-BCM"],
    },
    {
        "terms": ["fornecedor", "supplier", "terceiro"],
        "codes": ["IC-SUP"],
    },
    {
        "terms": ["evidencia", "auditoria", "audit", "melhoria"],
        "codes": ["IC-EVID"],
    },
]


def normalize_text(value):
    normalized = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn").lower()


def tokenize(value):
    tokens = normalize_text(value).replace("/", " ").replace("-", " ").split()
    return [token for token in tokens if len(token) > 3 and token not in STOP_WORDS]


def internal_control_score(control, tokens, policy_text):
    haystack = normalize_text(
        " ".join(
            part
            for part in [
                control.code,
                control.title,
                control.description,
                control.control_domain,
                control.objective,
                control.risk_statement,
                control.owner_role,
            ]
            if part
        )
    )
    score = 0
    matched = []

    for token in tokens:
        if token in haystack:
            score += 12
            matched.append(token)

    normalized_policy = normalize_text(policy_text)
    for hint in DOMAIN_HINTS:
        if any(term in normalized_policy for term in hint["terms"]):
            if any(str(control.code or "").startswith(prefix) for prefix in hint["codes"]):
                score += 35
                matched.extend(hint["terms"][:2])

    if control.source != InternalControl.Source.MIGRATED:
        score += 25
    if str(control.code or "").startswith("IC-GOV"):
        score += 20

    return score, sorted(set(matched))


class GovernanceAIAssistant:
    @staticmethod
    def recommend_controls_for_policy(policy_id):
        try:
            policy = Policy.objects.get(pk=policy_id)
        except Policy.DoesNotExist:
            return {"error": "Policy not found"}

        text = " ".join(
            part
            for part in [policy.code, policy.title, policy.description]
            if part
        )
        internal_text = " ".join(
            part
            for part in [
                policy.code,
                policy.title,
                policy.description,
                policy.objective,
                policy.scope,
                policy.owner,
            ]
            if part
        )
        tokens = tokenize(internal_text)
        linked_internal_control_ids = set(
            PolicyInternalControl.objects.filter(policy=policy).values_list("internal_control_id", flat=True)
        )
        linked_control_ids = set(
            PolicyControl.objects.filter(policy=policy).values_list("control_id", flat=True)
        )

        internal_controls = InternalControl.objects.filter(is_active=True).exclude(id__in=linked_internal_control_ids)
        preferred_internal_controls = internal_controls.exclude(source=InternalControl.Source.MIGRATED)
        scored_internal_controls = []
        for control in preferred_internal_controls:
            score, matched_terms = internal_control_score(control, tokens, internal_text)
            if score >= 25 or not tokens:
                scored_internal_controls.append((score, matched_terms, control))

        scored_internal_controls.sort(key=lambda item: (-item[0], item[2].code))
        internal_recommendations = []
        for score, matched_terms, control in scored_internal_controls[:12]:
            confidence = min(0.95, max(0.55, score / 100))
            internal_recommendations.append(
                {
                    "internal_control": str(control.id),
                    "code": control.code,
                    "title": control.title,
                    "description": control.description,
                    "control_domain": control.control_domain,
                    "criticality": control.criticality,
                    "source": control.source,
                    "confidence": round(confidence, 2),
                    "matched_terms": matched_terms[:6],
                    "rationale": "Sugestao internal-first baseada no catalogo interno de controlos e no contexto da politica.",
                }
            )

        controls = Control.objects.select_related("framework").filter(status=Control.Status.ACTIVE)
        if text:
            query = Q()
            for token in tokens[:8]:
                query |= Q(code__icontains=token) | Q(title__icontains=token) | Q(description__icontains=token)
            if query:
                controls = controls.filter(query)

        recommendations = []
        for control in controls.exclude(id__in=linked_control_ids).order_by("framework__code", "code")[:20]:
            recommendations.append({
                "control": str(control.id),
                "code": control.code,
                "title": control.title,
                "framework": control.framework.name if control.framework_id else "",
                "confidence": 0.62,
                "rationale": "Sugestao baseada em semelhanca textual com a politica analisada.",
            })

        return {
            "policy": str(policy.id),
            "policy_code": policy.code,
            "policy_title": policy.title,
            "internal_recommendations": internal_recommendations,
            "recommendations": recommendations,
        }
