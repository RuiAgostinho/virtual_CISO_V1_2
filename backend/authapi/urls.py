from django.urls import path
from .views import LoginView, MeView, LogoutView, CsrfView


urlpatterns = [
    path("csrf/", CsrfView.as_view()),
    path("login/", LoginView.as_view()),
    path("me/", MeView.as_view()),
    path("logout/", LogoutView.as_view()),
]