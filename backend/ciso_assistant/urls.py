from django.urls import path

from .views import AskCISOView

urlpatterns = [
    path("ask/", AskCISOView.as_view(), name="ciso-assistant-ask"),
]
