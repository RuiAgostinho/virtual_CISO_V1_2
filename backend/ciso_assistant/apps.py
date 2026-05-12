from django.apps import AppConfig


class CisoAssistantConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "ciso_assistant"

    def ready(self):
        import ciso_assistant.signals  # noqa: F401

