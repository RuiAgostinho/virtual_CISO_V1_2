import json
import time
import unicodedata
from collections import Counter
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ciso_assistant.services.chat.chat_service import ChatService


def normalize_text(text: str) -> str:
    text = (text or "").lower().strip()
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    )


class Command(BaseCommand):
    help = "Avalia o pipeline completo do assistente Virtual CISO com queries rotuladas."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dataset",
            default=str(Path(__file__).resolve().parents[4] / "docs" / "assistant_eval_queries.json"),
            help="Caminho para o ficheiro JSON com os cenários de avaliação do assistente.",
        )
        parser.add_argument(
            "--show-all",
            action="store_true",
            help="Mostra o detalhe de todos os cenários, incluindo os que passam.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Número máximo de cenários a executar.",
        )
        parser.add_argument(
            "--offset",
            type=int,
            default=0,
            help="Deslocamento inicial para execução por lotes.",
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

        offset = max(options["offset"], 0)
        limit = max(options["limit"], 0)
        if offset:
            dataset = dataset[offset:]
        if limit:
            dataset = dataset[:limit]
        if not dataset:
            raise CommandError("O subconjunto pedido do dataset ficou vazio.")

        total = len(dataset)
        task_hits = 0
        rag_hits = 0
        source_hits = 0
        content_hits = 0
        exact_hits = 0
        timing_values = []
        model_counter = Counter()
        decision_rows = []

        for item in dataset:
            query = (item.get("query") or "").strip()
            expected_task = item.get("expected_task_type")
            expected_used_rag = item.get("expected_used_rag")
            require_sources = bool(item.get("require_sources", False))
            must_contain = item.get("must_contain", []) or []
            must_not_contain = item.get("must_not_contain", []) or []
            notes = item.get("notes", "")

            if not query or not expected_task:
                raise CommandError("Cada item do dataset deve incluir 'query' e 'expected_task_type'.")

            started = time.perf_counter()
            result = ChatService.ask_ciso(query)
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            timing_values.append(elapsed_ms)

            response_text = result.get("response", "") or ""
            normalized_response = normalize_text(response_text)
            sources = result.get("sources") or []
            model_used = result.get("model_used", "unknown")
            model_counter[model_used] += 1

            task_ok = result.get("task_type") == expected_task
            rag_ok = result.get("used_rag") == expected_used_rag
            sources_ok = True if not require_sources else len(sources) > 0

            contains_ok = all(normalize_text(term) in normalized_response for term in must_contain)
            not_contains_ok = all(normalize_text(term) not in normalized_response for term in must_not_contain)
            content_ok = contains_ok and not_contains_ok

            if task_ok:
                task_hits += 1
            if rag_ok:
                rag_hits += 1
            if sources_ok:
                source_hits += 1
            if content_ok:
                content_hits += 1

            exact_ok = task_ok and rag_ok and sources_ok and content_ok
            if exact_ok:
                exact_hits += 1

            if options["show_all"] or not exact_ok:
                decision_rows.append(
                    {
                        "query": query,
                        "ok": exact_ok,
                        "expected_task_type": expected_task,
                        "predicted_task_type": result.get("task_type"),
                        "expected_used_rag": expected_used_rag,
                        "predicted_used_rag": result.get("used_rag"),
                        "require_sources": require_sources,
                        "sources_count": len(sources),
                        "model_used": model_used,
                        "latency_ms": elapsed_ms,
                        "contains_ok": contains_ok,
                        "not_contains_ok": not_contains_ok,
                        "response_preview": response_text[:280].replace("\n", " "),
                        "notes": notes,
                    }
                )

        avg_latency = round(sum(timing_values) / len(timing_values), 2)
        max_latency = round(max(timing_values), 2)
        min_latency = round(min(timing_values), 2)

        self.stdout.write(self.style.NOTICE("Avaliação do Assistente Virtual CISO"))
        self.stdout.write(f"Dataset: {dataset_path}")
        self.stdout.write(f"Total de cenários: {total}")
        self.stdout.write("")
        self.stdout.write(f"Acurácia task_type: {task_hits}/{total} = {task_hits / total:.2%}")
        self.stdout.write(f"Acurácia used_rag: {rag_hits}/{total} = {rag_hits / total:.2%}")
        self.stdout.write(f"Cenários com fontes quando exigidas: {source_hits}/{total} = {source_hits / total:.2%}")
        self.stdout.write(f"Validação de conteúdo: {content_hits}/{total} = {content_hits / total:.2%}")
        self.stdout.write(f"Acurácia exata funcional: {exact_hits}/{total} = {exact_hits / total:.2%}")
        self.stdout.write("")
        self.stdout.write(
            f"Latência (ms): média={avg_latency} | mínimo={min_latency} | máximo={max_latency}"
        )
        self.stdout.write("")

        self.stdout.write("Distribuição por modelo/caminho de resposta:")
        for model, count in model_counter.most_common():
            self.stdout.write(f"- {model}: {count}")

        if decision_rows:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Detalhe dos cenários analisados:"))
            for row in decision_rows:
                status = "OK" if row["ok"] else "MISMATCH"
                self.stdout.write(
                    f"[{status}] {row['query']}\n"
                    f"  esperado: task={row['expected_task_type']}, rag={row['expected_used_rag']}, sources={row['require_sources']}\n"
                    f"  previsto: task={row['predicted_task_type']}, rag={row['predicted_used_rag']}, sources={row['sources_count']}, model={row['model_used']}\n"
                    f"  conteúdo: must_contain={row['contains_ok']} | must_not_contain={row['not_contains_ok']} | latência={row['latency_ms']} ms\n"
                    f"  resposta: {row['response_preview']}\n"
                    f"  notas: {row['notes']}"
                )
