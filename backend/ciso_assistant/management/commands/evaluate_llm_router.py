import json
from collections import Counter, defaultdict
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ciso_assistant.services.llm_router import LLMRouter


class Command(BaseCommand):
    help = "Avalia o LLMRouter com um conjunto rotulado de perguntas."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dataset",
            default=str(Path(__file__).resolve().parents[4] / "docs" / "llmrouter_test_queries.json"),
            help="Caminho para um ficheiro JSON com queries rotuladas.",
        )
        parser.add_argument(
            "--show-all",
            action="store_true",
            help="Mostra o detalhe de todas as queries, incluindo acertos.",
        )

    def handle(self, *args, **options):
        dataset_path = Path(options["dataset"]).resolve()
        if not dataset_path.exists():
            raise CommandError(f"Dataset não encontrado: {dataset_path}")

        try:
            dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise CommandError(f"Não foi possível ler o dataset {dataset_path}: {exc}") from exc

        if not isinstance(dataset, list) or not dataset:
            raise CommandError("O dataset tem de ser uma lista JSON não vazia.")

        total = len(dataset)
        task_hits = 0
        rag_hits = 0
        exact_hits = 0
        source_counter = Counter()
        per_class_total = Counter()
        per_class_hits = Counter()
        confusion = defaultdict(Counter)
        mismatches = []

        for item in dataset:
            query = (item.get("query") or "").strip()
            expected_task = item.get("expected_task_type")
            expected_rag = item.get("expected_needs_rag")
            notes = item.get("notes", "")

            if not query or not expected_task:
                raise CommandError("Cada item do dataset deve incluir 'query' e 'expected_task_type'.")

            decision = LLMRouter.detect_task_type(query)
            predicted_task = decision["task_type"]
            predicted_rag = decision["needs_rag"]
            decision_source = decision.get("decision_source", "unknown")

            per_class_total[expected_task] += 1
            source_counter[decision_source] += 1
            confusion[expected_task][predicted_task] += 1

            task_ok = predicted_task == expected_task
            rag_ok = predicted_rag == expected_rag
            exact_ok = task_ok and rag_ok

            if task_ok:
                task_hits += 1
                per_class_hits[expected_task] += 1
            if rag_ok:
                rag_hits += 1
            if exact_ok:
                exact_hits += 1

            if options["show_all"] or not exact_ok:
                mismatches.append(
                    {
                        "query": query,
                        "expected_task_type": expected_task,
                        "predicted_task_type": predicted_task,
                        "expected_needs_rag": expected_rag,
                        "predicted_needs_rag": predicted_rag,
                        "decision_source": decision_source,
                        "confidence": decision.get("confidence"),
                        "reason": decision.get("reason"),
                        "notes": notes,
                        "ok": exact_ok,
                    }
                )

        self.stdout.write(self.style.NOTICE("Avaliação do LLMRouter"))
        self.stdout.write(f"Dataset: {dataset_path}")
        self.stdout.write(f"Total de queries: {total}")
        self.stdout.write("")
        self.stdout.write(f"Acurácia task_type: {task_hits}/{total} = {task_hits / total:.2%}")
        self.stdout.write(f"Acurácia needs_rag: {rag_hits}/{total} = {rag_hits / total:.2%}")
        self.stdout.write(f"Acurácia exata: {exact_hits}/{total} = {exact_hits / total:.2%}")
        self.stdout.write("")

        self.stdout.write("Distribuição por fonte de decisão:")
        for source, count in source_counter.most_common():
            self.stdout.write(f"- {source}: {count}")
        self.stdout.write("")

        self.stdout.write("Acurácia por classe:")
        for task_type, count in sorted(per_class_total.items()):
            hits = per_class_hits[task_type]
            self.stdout.write(f"- {task_type}: {hits}/{count} = {hits / count:.2%}")
        self.stdout.write("")

        self.stdout.write("Matriz esperada -> prevista:")
        for expected_task in sorted(confusion.keys()):
            preds = ", ".join(f"{pred}:{count}" for pred, count in sorted(confusion[expected_task].items()))
            self.stdout.write(f"- {expected_task} -> {preds}")

        if mismatches:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Detalhe das queries analisadas:"))
            for item in mismatches:
                status = "OK" if item["ok"] else "MISMATCH"
                self.stdout.write(
                    f"[{status}] {item['query']}\n"
                    f"  esperado: task={item['expected_task_type']}, rag={item['expected_needs_rag']}\n"
                    f"  previsto: task={item['predicted_task_type']}, rag={item['predicted_needs_rag']}\n"
                    f"  fonte={item['decision_source']} | confiança={item['confidence']} | razão={item['reason']}\n"
                    f"  notas={item['notes']}"
                )
