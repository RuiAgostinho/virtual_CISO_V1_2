import json
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    @staticmethod
    def call(prompt: str, model: str | None = None, temperature: float = 0.2) -> str:
        url = getattr(settings, "OLLAMA_URL", "")
        payload = {
            "model": model or getattr(settings, "OLLAMA_MODEL", "llama3.2:3b"),
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }

        if not url:
            return "O serviço LLM não está configurado nesta cópia recuperada."

        try:
            response = requests.post(url, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            return data.get("response", "")
        except Exception as exc:
            logger.warning("Ollama call failed: %s", exc)
            return "Não foi possível contactar o serviço LLM nesta cópia recuperada."

    @classmethod
    def generate_json(cls, prompt: str, model: str | None = None) -> dict:
        raw = cls.call(prompt, model=model)
        try:
            return json.loads(raw)
        except Exception:
            return {}

