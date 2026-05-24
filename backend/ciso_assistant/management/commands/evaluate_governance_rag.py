import json
import time
import unicodedata
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ciso_assistant.services.governance_context_adapter import GovernanceContextAdapter
from ciso_assistant.services.llm_router import LLMRouter
from ciso_assistant.services.prompt_builder import PromptBuilder
from ciso_assistant.services.source_normalizer import SourceNormalizer


def normalize_text(text: str) -> str:
    text = (text or "").lower().strip()
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    )


def contains_all(value: str, expected_terms: list[str]) -> bool:
    normalized_value = normalize_text(value)
    return all(normalize_text(term) in normalized_value for term in expected_terms)


class Command(BaseCommand):
    help = "Avalia a integracao RAG governance internal-first sem chamar o LLM."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dataset",
            default=str(Path(__file__).resolve().parents[4] / "docs" / "governance_rag_eval_queries.json"),
            help="Caminho para o ficheiro JSON com cenarios de avaliacao governance/RAG.",
        )
        parser.add_argument(
            "--show-all",
            action="store_true",
            help="Mostra o detalhe de todos os cenarios, incluindo os que passam.",
        )
        parser.add_argument("--limit", type=int, default=0, help="Numero maximo de cenarios a executar.")
        parser.add_argument("--offset", type=int, default=0, help="Deslocamento inicial para execucao por lotes.")
        parser.add_argument("--top-k", type=int, default=8, help="Numero maximo de chunks internos a avaliar.")
        parser.add_argument(
            "--fail-under",
            type=float,
            default=0.0,
            help="Falha se a acuracia exata ficar abaixo desta percentagem, por exemplo 90.",
        )

    def handle(self, *args, **options):
        dataset_path = Path(options["dataset"]).resolve()
        if not dataset_path.exists():
            raise CommandError(f"Dataset nao encontrado: {dataset_path}")

        try:
            dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise CommandError(f"Nao foi possivel ler o dataset {dataset_path}: {exc}") from exc

        if not isinstance(dataset, list) or not dataset:
            raise CommandError("O dataset tem de ser uma lista JSON nao vazia.")

        offset = max(options["offset"], 0)
        limit = max(options["limit"], 0)
        if offset:
            dataset = dataset[offset:]
        if limit:
            dataset = dataset[:limit]
        if not dataset:
            raise CommandError("O subconjunto pedido do dataset ficou vazio.")

        total = len(dataset)
        router_hits = 0
        rag_hits = 0
        first_source_hits = 0
        source_type_hits = 0
        label_hits = 0
        prompt_hits = 0
        exact_hits = 0
        detail_rows = []

        for item in dataset:
            query = (item.get("query") or "").strip()
            if not query:
                raise CommandError("Cada item do dataset deve incluir 'query'.")

            expected_task_type = item.get("expected_task_type")
            expected_needs_rag = item.get("expected_needs_rag")
            expected_first_source_type = item.get("expected_first_source_type")
            expected_source_types = item.get("expected_source_types", []) or []
            expected_source_labels = item.get("expected_source_labels", []) or []
            expected_prompt_terms = item.get("expected_prompt_terms", []) or []
            notes = item.get("notes", "")

            started = time.perf_counter()
            decision = LLMRouter.detect_task_type(query)
            chunks = GovernanceContextAdapter.retrieve_internal_first(
                query=query,
                top_k=max(options["top_k"], 1),
            )
            sources = SourceNormalizer.normalize_many(chunks)
            prompt = PromptBuilder.build_system_prompt(
                task_type=decision["task_type"],
                needs_rag=decision["needs_rag"],
                retrieved_chunks=chunks,
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

            source_types = [source["source_type"] for source in sources]
            source_labels = [source["source_label"] for source in sources]

            router_ok = True if expected_task_type is None else decision["task_type"] == expected_task_type
            rag_ok = True if expected_needs_rag is None else decision["needs_rag"] == expected_needs_rag
            first_source_ok = (
                True
                if expected_first_source_type is None
                else bool(sources) and sources[0]["source_type"] == expected_first_source_type
            )
            source_type_ok = all(source_type in source_types for source_type in expected_source_types)
            label_ok = all(label in source_labels for label in expected_source_labels)
            prompt_ok = contains_all(prompt, expected_prompt_terms)
            exact_ok = router_ok and rag_ok and first_source_ok and source_type_ok and label_ok and prompt_ok

            if router_ok:
                router_hits += 1
            if rag_ok:
                rag_hits += 1
            if first_source_ok:
                first_source_hits += 1
            if source_type_ok:
                source_type_hits += 1
            if label_ok:
                label_hits += 1
            if prompt_ok:
                prompt_hits += 1
            if exact_ok:
                exact_hits += 1

            if options["show_all"] or not exact_ok:
                detail_rows.append(
                    {
                        "ok": exact_ok,
                        "query": query,
                        "expected_task_type": expected_task_type,
                        "predicted_task_type": decision["task_type"],
                        "expected_needs_rag": expected_needs_rag,
                        "predicted_needs_rag": decision["needs_rag"],
                        "expected_first_source_type": expected_first_source_type,
                        "predicted_first_source_type": source_types[0] if source_types else None,
                        "sources_count": len(sources),
                        "source_types": source_types,
                        "source_labels": source_labels,
                        "router_ok": router_ok,
                        "rag_ok": rag_ok,
                        "first_source_ok": first_source_ok,
                        "source_type_ok": source_type_ok,
                        "label_ok": label_ok,
                        "prompt_ok": prompt_ok,
                        "latency_ms": elapsed_ms,
                        "notes": notes,
                    }
                )

        exact_rate = exact_hits / total

        self.stdout.write(self.style.NOTICE("Avaliacao RAG governance internal-first"))
        self.stdout.write(f"Dataset: {dataset_path}")
        self.stdout.write(f"Total de cenarios: {total}")
        self.stdout.write("")
        self.stdout.write(f"Acuracia router task_type: {router_hits}/{total} = {router_hits / total:.2%}")
        self.stdout.write(f"Acuracia needs_rag: {rag_hits}/{total} = {rag_hits / total:.2%}")
        self.stdout.write(f"Fonte inicial esperada: {first_source_hits}/{total} = {first_source_hits / total:.2%}")
        self.stdout.write(f"Cobertura de tipos de fonte: {source_type_hits}/{total} = {source_type_hits / total:.2%}")
        self.stdout.write(f"Etiquetas normalizadas: {label_hits}/{total} = {label_hits / total:.2%}")
        self.stdout.write(f"Prompt internal-first: {prompt_hits}/{total} = {prompt_hits / total:.2%}")
        self.stdout.write(f"Acuracia exata funcional: {exact_hits}/{total} = {exact_rate:.2%}")

        if detail_rows:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Detalhe dos cenarios analisados:"))
            for row in detail_rows:
                status = "OK" if row["ok"] else "MISMATCH"
                self.stdout.write(
                    f"[{status}] {row['query']}\n"
                    f"  task: esperado={row['expected_task_type']} previsto={row['predicted_task_type']} ok={row['router_ok']}\n"
                    f"  rag: esperado={row['expected_needs_rag']} previsto={row['predicted_needs_rag']} ok={row['rag_ok']}\n"
                    f"  primeira fonte: esperado={row['expected_first_source_type']} previsto={row['predicted_first_source_type']} ok={row['first_source_ok']}\n"
                    f"  fontes={row['sources_count']} tipos={row['source_types']} labels={row['source_labels']}\n"
                    f"  source_types_ok={row['source_type_ok']} labels_ok={row['label_ok']} prompt_ok={row['prompt_ok']} latencia={row['latency_ms']} ms\n"
                    f"  notas={row['notes']}"
                )

        fail_under = float(options["fail_under"] or 0.0)
        if fail_under and (exact_rate * 100) < fail_under:
            raise CommandError(
                f"Acuracia exata {exact_rate:.2%} abaixo do limite configurado ({fail_under:.2f}%)."
            )
