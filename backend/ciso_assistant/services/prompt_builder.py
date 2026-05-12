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
                "1. You MUST formulate your answer using ONLY the facts from the RETRIEVED KNOWLEDGE CONTEXT above.\n"
                "2. Do NOT hallucinate assets, vulnerabilities, controls, mechanisms, or evidence that are not mentioned in the context.\n"
                "3. If the context is empty or insufficient, explicitly state: "
                "'De acordo com os registos atuais da organizacao, nao possuo dados suficientes sobre este assunto.'\n"
                f"{role_instructions}"
            )
            return base_prompt + "\n" + rag_instructions

        fallback = (
            "\n\n### TASK INSTRUCTIONS:\n"
            f"{role_instructions}"
        )
        return base_prompt + "\n" + fallback

    @classmethod
    def _get_role_instructions(cls, task_type: str) -> str:
        if task_type == "risk_analysis":
            return "4. Focus on impact, probability, asset exposure, business criticality, and mitigation options."
        if task_type == "control_mapping":
            return "4. Cross-reference requirements directly to exact frameworks, controls, and mechanisms when available."
        if task_type == "executive_advisory":
            return "4. Keep sentences concise and focus on governance priorities, business risk, ownership, and decision options."
        if task_type == "evidence_drafting":
            return "4. Format the response as audit-ready evidence text, with clear scope, action, owner, date, and validation criteria."
        return "4. Provide directly actionable answers prioritizing security fundamentals."