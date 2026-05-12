from ..orchestrator import QueryOrchestrator



class ChatService:

    @staticmethod

    def ask_ciso(user_query: str, history: list = None, filters: dict = None) -> dict:

        """

        Main execution pipeline for the Hybrid LLM Orchestrator.

        Redirects to the standardized CISOOrchestrator.

        """

        return QueryOrchestrator.process_query(user_query, history=history, filters=filters)



