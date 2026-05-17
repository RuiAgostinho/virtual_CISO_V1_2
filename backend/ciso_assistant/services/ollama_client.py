import json
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    @staticmethod
    def call(
        prompt: str,
        model: str | None = None,
        temperature: float = 0.2,
        system: str | None = None,
        options: dict | None = None,
    ) -> str:
        url = getattr(settings, "OLLAMA_URL", "")

        # An explicit `options` dict takes precedence; otherwise fall back to
        # the `temperature` shorthand. Both calling styles stay valid:
        #   call(prompt, model, temperature)
        #   call(prompt, model, system=..., options={...})
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
            return "O serviço LLM não está configurado nesta instalação."

        try:
            response = requests.post(url, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            return data.get("response", "")
        except Exception as exc:
            logger.warning("Ollama call failed: %s", exc)
            return "Não foi possível contactar o serviço LLM nesta instalação."

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
