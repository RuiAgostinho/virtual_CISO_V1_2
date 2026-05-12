from django.shortcuts import render

# Create your views here.

from django.contrib.auth import authenticate, get_user_model
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from rest_framework_simplejwt.tokens import RefreshToken

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
            "id": user.id, "email": user.email, "name": f"{user.first_name} {user.last_name}".strip() or user.username
        }})
        res.set_cookie(COOKIE_ACCESS["key"], access, httponly=True, samesite="Lax", secure=False, path="/")
        res.set_cookie(COOKIE_REFRESH["key"], str(refresh), httponly=True, samesite="Lax", secure=False, path="/")
        return res

class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        u = request.user
        return Response({"id": u.id, "email": u.email, "name": f"{u.first_name} {u.last_name}".strip() or u.username})

@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        res = Response(status=status.HTTP_204_NO_CONTENT)
        res.delete_cookie(COOKIE_ACCESS["key"], path="/")
        res.delete_cookie(COOKIE_REFRESH["key"], path="/")
        return res