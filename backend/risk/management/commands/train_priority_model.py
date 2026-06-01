import sys

from django.core.management.base import BaseCommand, CommandError

from risk.models.priority_model import PriorityModelConfig
from risk.services.priority_model import (
    PriorityModelDataError,
    PriorityModelDependencyError,
    PriorityModelRuntime,
)


def _ensure_utf8_stdout():
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except Exception:
                pass


class Command(BaseCommand):
    help = "Treina o estimador interno XGBoost+SHAP a partir do feature store de priorizacao."

    def add_arguments(self, parser):
        parser.add_argument("--min-samples", type=int, default=None, help="Desfechos rotulados mínimos.")
        parser.add_argument("--test-size", type=float, default=0.25, help="Proporção holdout entre 0.1 e 0.4.")
        parser.add_argument("--random-state", type=int, default=42, help="Seed de treino.")
        parser.add_argument("--activate", action="store_true", help="Ativa xgboost_shap se o treino passar o gate.")
        parser.add_argument(
            "--force",
            action="store_true",
            help="Permite treinar abaixo do limiar configurado. Útil apenas para ensaios controlados.",
        )
        parser.add_argument(
            "--check-dependencies",
            action="store_true",
            help="Mostra dependências opcionais de ML sem treinar.",
        )

    def handle(self, *args, **options):
        _ensure_utf8_stdout()

        if options["check_dependencies"]:
            status = PriorityModelRuntime.dependency_status()
            for name, installed in status.items():
                label = self.style.SUCCESS("OK") if installed else self.style.ERROR("EM FALTA")
                self.stdout.write(f"{name:12s} {label}")
            return

        try:
            result = PriorityModelRuntime.train(
                minimum_samples=options.get("min_samples"),
                test_size=options.get("test_size"),
                random_state=options.get("random_state"),
                activate=options.get("activate"),
                force=options.get("force"),
            )
        except (PriorityModelDependencyError, PriorityModelDataError) as exc:
            raise CommandError(str(exc)) from exc

        config = PriorityModelConfig.get_config()
        self.stdout.write(self.style.SUCCESS("Modelo XGBoost+SHAP treinado com sucesso."))
        self.stdout.write(f"Versão: {result.model_version}")
        self.stdout.write(f"Artefacto: {result.artifact_path}")
        self.stdout.write(f"Amostras rotuladas: {result.labeled_samples}")
        self.stdout.write(f"Treino/holdout: {result.train_samples}/{result.test_samples}")
        self.stdout.write(f"AUC holdout: {result.holdout_auc if result.holdout_auc is not None else 'n/d'}")
        self.stdout.write(f"Brier holdout: {result.holdout_brier:.3f}")
        self.stdout.write(f"Modo configurado: {config.mode}")
        if not options.get("activate"):
            self.stdout.write(
                self.style.WARNING(
                    "O modelo foi registado mas não ativado. Ative no painel de administração quando quiser servir XGBoost+SHAP."
                )
            )
