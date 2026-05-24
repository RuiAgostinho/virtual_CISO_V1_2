from django.urls import path

from .views import (
    AskCISOView,
    AssistantRecommendationDetailView,
    AssistantRecommendationHistoryView,
    ConvertAssistantRecommendationView,
    PolicyAdviceView,
    RagOverviewView,
    RagReindexView,
)

urlpatterns = [
    path("ask/", AskCISOView.as_view(), name="ciso-assistant-ask"),
    path("policy-advice/", PolicyAdviceView.as_view(), name="ciso-policy-advice"),
    path("history/", AssistantRecommendationHistoryView.as_view(), name="ciso-assistant-history"),
    path("history/<uuid:recommendation_id>/", AssistantRecommendationDetailView.as_view(), name="ciso-assistant-history-detail"),
    path("history/<uuid:recommendation_id>/convert/", ConvertAssistantRecommendationView.as_view(), name="ciso-assistant-history-convert"),
    path("rag/overview/", RagOverviewView.as_view(), name="rag-overview"),
    path("rag/reindex/", RagReindexView.as_view(), name="rag-reindex"),
]
