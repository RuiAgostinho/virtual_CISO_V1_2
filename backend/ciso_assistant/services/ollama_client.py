import json
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

SERVICE_UNAVAILABLE_MESSAGE = "Não foi possível contactar o serviço LLM nesta instalação."
SERVICE_NOT_CONFIGURED_MESSAGE = "O serviço LLM não está configurado nesta instalação."


def ollama_base_url() -> str:
    """Return the configured Ollama host base, stripping any /api/... suffix."""
    base = (getattr(settings, "OLLAMA_URL", "") or "").strip()
    if not base:
        return ""
    if "/api/" in base:
        base = base.rsplit("/api/", 1)[0]
    return base.rstrip("/")


def ollama_generate_url() -> str:
    """Return the Ollama text-generation endpoint."""
    base = ollama_base_url()
    if not base:
        return ""
    return f"{base}/api/generate"


class OllamaClient:
    @staticmethod
    def is_service_error(text: str | None) -> bool:
        return (text or "").strip() in {
            SERVICE_UNAVAILABLE_MESSAGE,
            SERVICE_NOT_CONFIGURED_MESSAGE,
            "",
        }

    @staticmethod
    def call(
        prompt: str,
        model: str | None = None,
        temperature: float = 0.2,
        system: str | None = None,
        options: dict | None = None,
        timeout_seconds: int | None = None,
    ) -> str:
        url = ollama_generate_url()

        final_options = dict(options) if options else {}
        final_options.setdefault("temperature", temperature)

        payload: dict = {
            "model": model or getattr(settings, "OLLAMA_MODEL", "llama3.2:3b"),
            "prompt": prompt,
            "stream": False,
            "options": final_options,
        }
        if system:
            payload["system"] = system

        if not url:
            return SERVICE_NOT_CONFIGURED_MESSAGE

        try:
            effective_timeout = timeout_seconds or getattr(settings, "OLLAMA_TIMEOUT_SECONDS", 180)
            response = requests.post(url, json=payload, timeout=effective_timeout)
            response.raise_for_status()
            data = response.json()
            return data.get("response", "")
        except Exception as exc:
            logger.warning("Ollama call failed: %s", exc)
            return SERVICE_UNAVAILABLE_MESSAGE

    @classmethod
    def generate_json(
        cls,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
        options: dict | None = None,
    ) -> dict:
        raw = cls.call(prompt, model=model, system=system, options=options)
        try:
            return json.loads(raw)
        except Exception:
            return {}
