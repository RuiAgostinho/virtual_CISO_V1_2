from django.shortcuts import render

# Create your views here.

from django.contrib.auth import authenticate, get_user_model
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

User = get_user_model()

COOKIE_ACCESS = {"key": "access", "httponly": True, "samesite": "Lax", "secure": False, "path": "/"}
COOKIE_REFRESH = {"key": "refresh", "httponly": True, "samesite": "Lax", "secure": False, "path": "/"}

@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request):
        # Só garante que o cookie csrftoken é definido
        return Response({"detail": "ok"})

@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        email = (request.data.get("email") or "").lower().strip()
        password = request.data.get("password") or ""
        try:
            user = User.objects.get(email__iexact=email)
            username = user.get_username()
        except User.DoesNotExist:
            return Response({"detail": "Credenciais inválidas."}, status=status.HTTP_401_UNAUTHORIZED)

        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({"detail": "Credenciais inválidas."}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        res = Response({"user": {
            "id": user.id, "email": user.email,
            "name": f"{user.first_name} {user.last_name}".strip() or user.username,
            "is_staff": user.is_staff, "is_superuser": user.is_superuser,
        }})
        res.set_cookie(COOKIE_ACCESS["key"], access, httponly=True, samesite="Lax", secure=False, path="/")
        res.set_cookie(COOKIE_REFRESH["key"], str(refresh), httponly=True, samesite="Lax", secure=False, path="/")
        return res

@method_decorator(csrf_protect, name="dispatch")
class RefreshView(APIView):
    """
    Issues a fresh `access` cookie from the `refresh` cookie.

    Lets the frontend recover transparently from an expired access token
    (30 min) without forcing the user to log in again, as long as the
    refresh token (7 days) is still valid.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get("refresh")
        if not raw_refresh:
            return Response({"detail": "Sem refresh token."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(raw_refresh)
        except TokenError:
            # Refresh token expired/invalid: clear both cookies so the client
            # falls back to the login flow with a clean slate.
            res = Response({"detail": "Sessão expirada."}, status=status.HTTP_401_UNAUTHORIZED)
            res.delete_cookie(COOKIE_ACCESS["key"], path="/")
            res.delete_cookie(COOKIE_REFRESH["key"], path="/")
            return res

        access = str(refresh.access_token)
        res = Response({"detail": "ok"})
        res.set_cookie(COOKIE_ACCESS["key"], access, httponly=True, samesite="Lax", secure=False, path="/")
        return res


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        u = request.user
        return Response({
            "id": u.id, "email": u.email,
            "name": f"{u.first_name} {u.last_name}".strip() or u.username,
            "is_staff": u.is_staff, "is_superuser": u.is_superuser,
        })

@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        res = Response(status=status.HTTP_204_NO_CONTENT)
        res.delete_cookie(COOKIE_ACCESS["key"], path="/")
        res.delete_cookie(COOKIE_REFRESH["key"], path="/")
        return res