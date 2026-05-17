class PromptBuilder:
    """
    Builds the system prompt used by the Virtual CISO assistant.
    """

    @classmethod
    def build_system_prompt(cls, task_type: str, needs_rag: bool, retrieved_chunks: list) -> str:
        base_prompt = (
            "You are a professional Virtual CISO (Chief Information Security Officer) assistant. "
            "Always answer in European Portuguese (PT-PT), with concise, evidence-aware and business-relevant language."
        )

        context_text = ""
        if needs_rag and retrieved_chunks:
            formatted = []
            for idx, chunk in enumerate(retrieved_chunks, 1):
                meta_tag = f"[{chunk['source_type'].upper()}]"
                if chunk.get("framework"):
                    meta_tag += f" Framework: {chunk['framework']}"
                if chunk.get("control_code"):
                    meta_tag += f" Control: {chunk['control_code']}"
                formatted.append(f"--- Doc {idx} {meta_tag} ---\n{chunk['chunk_text']}\n")
            context_text = "\n".join(formatted)

        role_instructions = cls._get_role_instructions(task_type)

        if needs_rag:
            rag_instructions = (
                f"\n\n### RETRIEVED KNOWLEDGE CONTEXT:\n{context_text if context_text else 'No direct records found.'}\n\n"
                "### STRICT INSTRUCTIONS:\n"
                "1. Base the answer only on the retrieved context when discussing organization data.\n"
                "2. Do not invent assets, vulnerabilities, controls, mechanisms, policies, or evidence.\n"
                "3. If the context is insufficient, say clearly that the current records are not enough to answer safely.\n"
                "4. When relevant, mention the retrieved sources explicitly in the answer body.\n"
                f"{role_instructions}"
            )
            return base_prompt + "\n" + rag_instructions

        fallback = "\n\n### TASK INSTRUCTIONS:\n" f"{role_instructions}"
        return base_prompt + "\n" + fallback

    @classmethod
    def _get_role_instructions(cls, task_type: str) -> str:
        if task_type == "risk_analysis":
            return "5. Focus on impact, probability, asset exposure, business criticality, and mitigation options."
        if task_type == "control_mapping":
            return "5. Cross-reference requirements directly to exact frameworks, controls, and mechanisms when available."
        if task_type == "executive_advisory":
            return "5. Keep sentences concise and focus on governance priorities, business risk, ownership, and decision options."
        if task_type == "evidence_drafting":
            return "5. Format the response as audit-ready evidence text, with clear scope, action, owner, date, and validation criteria."
        return "5. Provide directly actionable answers prioritizing security fundamentals."
