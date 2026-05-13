from django.db.models import Q

from governance.models import Control, Policy, PolicyControl


class GovernanceAIAssistant:
    @staticmethod
    def recommend_controls_for_policy(policy_id):
        try:
            policy = Policy.objects.get(pk=policy_id)
        except Policy.DoesNotExist:
            return {"error": "Policy not found"}

        text = " ".join(
            part.lower()
            for part in [policy.code, policy.title, policy.description]
            if part
        )
        linked_control_ids = set(
            PolicyControl.objects.filter(policy=policy).values_list("control_id", flat=True)
        )

        controls = Control.objects.select_related("framework").filter(status=Control.Status.ACTIVE)
        if text:
            tokens = [token for token in text.replace("/", " ").replace("-", " ").split() if len(token) > 3]
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
            "recommendations": recommendations,
        }
