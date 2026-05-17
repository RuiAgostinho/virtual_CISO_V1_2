from django.urls import path

from .views import AskCISOView, RagOverviewView, RagReindexView

urlpatterns = [
    path("ask/", AskCISOView.as_view(), name="ciso-assistant-ask"),
    path("rag/overview/", RagOverviewView.as_view(), name="rag-overview"),
    path("rag/reindex/", RagReindexView.as_view(), name="rag-reindex"),
]
