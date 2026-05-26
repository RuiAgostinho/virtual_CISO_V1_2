import bisect
import re
import subprocess
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ciso_assistant.models import KnowledgeChunk
from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService


ARTICLE_RE = re.compile(r"(?m)^\s*Artigo\s+(?P<number>\d+)\.?\s*(?:º|o)\s*$")
PAGE_BREAK = "\f"
DOCUMENT_CODE = "DL125_2025"
DOCUMENT_LABEL = "Decreto-Lei n.º 125/2025"


class Command(BaseCommand):
    help = "Ingere o DL 125/2025 como fonte normativa RAG, com chunks por artigo e embeddings."

    def add_arguments(self, parser):
        parser.add_argument(
            "--pdf",
            default="../docs/DL125_2025.pdf",
            help="Caminho para o PDF do DL 125/2025.",
        )
        parser.add_argument(
            "--max-chars",
            type=int,
            default=2400,
            help="Tamanho maximo aproximado de cada chunk textual.",
        )
        parser.add_argument(
            "--clear-existing",
            action="store_true",
            help="Remove chunks existentes do DL 125/2025 antes de recriar.",
        )
        parser.add_argument(
            "--skip-embeddings",
            action="store_true",
            help="Cria/atualiza chunks sem chamar o servico de embeddings.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Recria tambem chunks que ja existem com embedding.",
        )

    def handle(self, *args, **options):
        pdf_path = Path(options["pdf"])
        if not pdf_path.is_absolute():
            pdf_path = (Path.cwd() / pdf_path).resolve()
        if not pdf_path.exists():
            raise CommandError(f"PDF nao encontrado: {pdf_path}")

        raw_text = self._extract_pdf_text(pdf_path)
        if not raw_text.strip():
            raise CommandError("Nao foi possivel extrair texto do PDF.")

        if options["clear_existing"]:
            deleted, _ = KnowledgeChunk.objects.filter(
                source_type="technical_regulation",
                source_ref__startswith=f"{DOCUMENT_CODE}:",
            ).delete()
            self.stdout.write(self.style.WARNING(f"Chunks DL 125/2025 removidos: {deleted}"))

        page_starts = self._page_starts(raw_text)
        articles = self._extract_articles(raw_text, page_starts)
        if not articles:
            raise CommandError("Nenhum artigo foi detetado no PDF.")

        created = 0
        updated = 0
        failed = 0
        skipped_embeddings = 0
        skipped_existing = 0
        total_segments = 0

        for article in articles:
            segments = self._segment_article(article["text"], options["max_chars"])
            total_segments += len(segments)
            for index, segment in enumerate(segments, start=1):
                title = self._chunk_title(article, index, len(segments))
                source_ref = (
                    f"{DOCUMENT_CODE}:article-{article['normalized_number']}:"
                    f"seq-{article['sequence']:03d}:segment-{index:02d}"
                )
                if not options["force"] and not options["clear_existing"]:
                    existing = KnowledgeChunk.objects.filter(
                        source_type="technical_regulation",
                        source_ref=source_ref,
                        embedding__isnull=False,
                    ).only("id").first()
                    if existing:
                        skipped_existing += 1
                        continue

                text = self._chunk_text(article, segment, index, len(segments))
                metadata = {
                    "normative_document": DOCUMENT_CODE,
                    "document_label": DOCUMENT_LABEL,
                    "document_title": article["document_title"],
                    "article_number": article["article_number"],
                    "article_title": article["article_title"],
                    "article_sequence": article["sequence"],
                    "segment_index": index,
                    "segment_count": len(segments),
                    "page_start": article["page_start"],
                    "page_end": article["page_end"],
                    "citation": self._citation(article, index, len(segments)),
                    "anchor": (
                        f"dl125-2025-artigo-{article['normalized_number']}"
                        f"-seq-{article['sequence']:03d}-s{index:02d}"
                    ),
                    "source_path": str(pdf_path),
                    "source_file": "docs/DL125_2025.pdf",
                }
                embedding = None
                if options["skip_embeddings"]:
                    skipped_embeddings += 1
                else:
                    embedding = KnowledgeIngestionService.embed(text, title)
                    if not embedding:
                        failed += 1
                        self.stdout.write(self.style.WARNING(f"Embedding falhou: {source_ref}"))
                        continue

                obj, was_created = KnowledgeIngestionService.save_chunk(
                    source_type="technical_regulation",
                    source_ref=source_ref,
                    title=title,
                    text=text,
                    embedding=embedding,
                    framework="DL 125/2025",
                    control_code=f"Artigo {article['article_number']}",
                    metadata=metadata,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
                self.stdout.write(f"Indexado: {obj.title} [{source_ref}]")

        self.stdout.write(
            self.style.SUCCESS(
                "Ingestao normativa DL 125/2025 concluida. "
                f"Artigos detetados: {len(articles)} | "
                f"Chunks: {total_segments} | Criados: {created} | Atualizados: {updated} | "
                f"Ja existentes: {skipped_existing} | Sem embedding: {skipped_embeddings} | Falhas: {failed}"
            )
        )

    def _extract_pdf_text(self, pdf_path: Path) -> str:
        command = ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"]
        try:
            result = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        except FileNotFoundError as exc:
            raise CommandError(
                "O utilitario 'pdftotext' nao esta disponivel no PATH. "
                "Instala Poppler/MiKTeX ou executa a ingestao numa maquina com pdftotext."
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise CommandError(f"Falha ao extrair texto do PDF: {exc.stderr or exc}") from exc
        return result.stdout or ""

    def _page_starts(self, text: str) -> list[int]:
        starts = [0]
        for match in re.finditer(PAGE_BREAK, text):
            starts.append(match.end())
        return starts

    def _page_for_offset(self, page_starts: list[int], offset: int) -> int:
        return max(1, bisect.bisect_right(page_starts, offset))

    def _extract_articles(self, raw_text: str, page_starts: list[int]) -> list[dict]:
        matches = list(ARTICLE_RE.finditer(raw_text))
        articles = []
        document_title = self._document_title(raw_text)
        for sequence, match in enumerate(matches, start=1):
            next_start = matches[sequence].start() if sequence < len(matches) else len(raw_text)
            article_raw = raw_text[match.start() : next_start]
            article_number = f"{match.group('number')}.º"
            title = self._article_title(article_raw)
            cleaned = self._clean_article_text(article_raw)
            if not cleaned:
                continue
            articles.append(
                {
                    "sequence": sequence,
                    "article_number": article_number,
                    "normalized_number": match.group("number"),
                    "article_title": title,
                    "document_title": document_title,
                    "context": self._context_before(raw_text[: match.start()]),
                    "text": cleaned,
                    "page_start": self._page_for_offset(page_starts, match.start()),
                    "page_end": self._page_for_offset(page_starts, max(match.start(), next_start - 1)),
                }
            )
        return articles

    def _document_title(self, raw_text: str) -> str:
        for line in raw_text.splitlines()[:80]:
            line = line.strip()
            if line.startswith("Sumário:"):
                return line
        return "Transpoe a Diretiva (UE) 2022/2555 e aprova o regime juridico da ciberseguranca."

    def _article_title(self, article_raw: str) -> str:
        seen_article = False
        for line in article_raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if ARTICLE_RE.match(stripped):
                seen_article = True
                continue
            if seen_article and not self._is_boilerplate(stripped):
                return stripped
        return "Sem titulo"

    def _context_before(self, text_before: str) -> str:
        context_lines = []
        for line in text_before.splitlines()[-160:]:
            stripped = line.strip()
            if re.match(r"^(ANEXO|CAP[ÍI]TULO|SEC[ÇC][ÃA]O)\b", stripped, re.IGNORECASE):
                context_lines.append(stripped)
        return context_lines[-1] if context_lines else ""

    def _clean_article_text(self, article_raw: str) -> str:
        lines = []
        for line in article_raw.replace(PAGE_BREAK, "\n").splitlines():
            stripped = line.strip()
            if self._is_boilerplate(stripped):
                continue
            lines.append(stripped)

        paragraphs = []
        current = []
        for line in lines:
            if not line:
                if current:
                    paragraphs.append(self._join_wrapped_lines(current))
                    current = []
                continue
            current.append(line)
        if current:
            paragraphs.append(self._join_wrapped_lines(current))

        return "\n\n".join(paragraph for paragraph in paragraphs if paragraph).strip()

    def _is_boilerplate(self, line: str) -> bool:
        if not line:
            return False
        return bool(
            re.match(r"^\d+/\d+$", line)
            or re.match(r"^\d{8,}$", line)
            or line in {"1.ª série", "Decreto-Lei n.º 125/2025"}
            or line.startswith("N.º 234")
            or line == "04-12-2025"
        )

    def _join_wrapped_lines(self, lines: list[str]) -> str:
        text = ""
        for line in lines:
            if not text:
                text = line
                continue
            if text.endswith("-") and line[:1].islower():
                text = text[:-1] + line
            else:
                text += " " + line
        return re.sub(r"\s+", " ", text).strip()

    def _segment_article(self, text: str, max_chars: int) -> list[str]:
        paragraphs = [paragraph.strip() for paragraph in text.split("\n\n") if paragraph.strip()]
        if not paragraphs:
            return []

        segments = []
        current = []
        current_length = 0
        for paragraph in paragraphs:
            projected = current_length + len(paragraph) + (2 if current else 0)
            if current and projected > max_chars:
                segments.append("\n\n".join(current))
                current = [paragraph]
                current_length = len(paragraph)
            else:
                current.append(paragraph)
                current_length = projected
        if current:
            segments.append("\n\n".join(current))
        return segments

    def _chunk_title(self, article: dict, segment_index: int, segment_count: int) -> str:
        suffix = f" - Segmento {segment_index}/{segment_count}" if segment_count > 1 else ""
        return f"DL 125/2025 - Artigo {article['article_number']} - {article['article_title']}{suffix}"

    def _chunk_text(self, article: dict, segment: str, segment_index: int, segment_count: int) -> str:
        context = f" Contexto: {article['context']}." if article["context"] else ""
        segment_label = f" Segmento {segment_index}/{segment_count}." if segment_count > 1 else ""
        return (
            f"{DOCUMENT_LABEL}.{context} Artigo {article['article_number']} - "
            f"{article['article_title']}.{segment_label}\n\n{segment}"
        )

    def _citation(self, article: dict, segment_index: int, segment_count: int) -> str:
        pages = (
            f"p. {article['page_start']}"
            if article["page_start"] == article["page_end"]
            else f"pp. {article['page_start']}-{article['page_end']}"
        )
        segment = f", segmento {segment_index}/{segment_count}" if segment_count > 1 else ""
        return f"{DOCUMENT_LABEL}, Artigo {article['article_number']} ({article['article_title']}), {pages}{segment}"
