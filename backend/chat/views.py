import requests
from django.conf import settings
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapi.auth import CookieJWTAuthentication

try:
    from rest_framework_simplejwt.authentication import JWTAuthentication

    AUTH_CLASSES = [SessionAuthentication, JWTAuthentication]
except Exception:
    AUTH_CLASSES = [SessionAuthentication]


class ChatView(APIView):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        messages = request.data.get("messages", [])
        if not isinstance(messages, list) or not messages:
            return Response({"error": "messages invalido"}, status=status.HTTP_400_BAD_REQUEST)

        system_prompt = (
            "Es um assistente virtual CISO. Responde sempre em Portugues de Portugal, "
            "de forma profissional, direta e prestavel."
        )
        formatted_messages = [f'{m.get("role")}: {m.get("content")}' for m in messages if m.get("content")]
        prompt = system_prompt + "\n\n" + "\n".join(formatted_messages)

        ollama_url = getattr(settings, "OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        if not ollama_url.endswith("/api/generate"):
            ollama_url = f"{ollama_url}/api/generate"
        model = getattr(settings, "OLLAMA_MODEL", "llama3.2:3b")

        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_thread": 8,
                "num_ctx": 1024,
            },
        }

        try:
            response = requests.post(ollama_url, json=payload, timeout=(10, 600))
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            return Response(
                {"error": f"{type(exc).__name__}: {str(exc)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        reply = data.get("response") or data.get("message") or ""
        return Response({"reply": reply}, status=status.HTTP_200_OK)