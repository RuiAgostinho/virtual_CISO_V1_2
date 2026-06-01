import bisect
import re
import subprocess
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ciso_assistant.models import KnowledgeChunk
from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService


ARTICLE_RE = re.compile(r"(?m)^\s*Artigo\s+(?P<number>\d+)\.?\s*(?:o|º)?\s*$", re.IGNORECASE)
TOP_LEVEL_RE = re.compile(r"^(?P<number>\d+)\.\s+(?P<body>.+)")
LETTER_RE = re.compile(r"^(?P<letter>[a-z])\)\s+(?P<body>.+)", re.IGNORECASE)
PAGE_BREAK = "\f"
DOCUMENT_CODE = "NIS2_2022"
DOCUMENT_LABEL = "Diretiva (UE) 2022/2555 (NIS2)"
DOCUMENT_TITLE = "Diretiva NIS2 - medidas de ciberseguranca e obrigacoes de notificacao"


class Command(BaseCommand):
    help = "Ingere a Diretiva NIS2 como fonte normativa RAG, com chunks citaveis por artigo/paragrafo."

    def add_arguments(self, parser):
        parser.add_argument(
            "--pdf",
            default="../docs/frameworks/NIS2.pdf",
            help="Caminho para o PDF da Diretiva NIS2.",
        )
        parser.add_argument(
            "--max-chars",
            type=int,
            default=1800,
            help="Tamanho maximo aproximado de cada chunk textual.",
        )
        parser.add_argument(
            "--clear-existing",
            action="store_true",
            help="Remove chunks existentes da NIS2 antes de recriar.",
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
            self.stdout.write(self.style.WARNING(f"Chunks NIS2 removidos: {deleted}"))

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
            blocks = self._article_blocks(article)
            for block in blocks:
                segments = self._split_text(block["text"], options["max_chars"])
                total_segments += len(segments)
                for segment_index, segment in enumerate(segments, start=1):
                    source_ref = self._source_ref(article, block, segment_index)
                    if not options["force"] and not options["clear_existing"]:
                        existing = KnowledgeChunk.objects.filter(
                            source_type="technical_regulation",
                            source_ref=source_ref,
                            embedding__isnull=False,
                        ).only("id").first()
                        if existing:
                            skipped_existing += 1
                            continue

                    title = self._chunk_title(article, block, segment_index, len(segments))
                    text = self._chunk_text(article, block, segment, segment_index, len(segments))
                    metadata = self._metadata(pdf_path, article, block, segment_index, len(segments))
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
                        framework="NIS2",
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
                "Ingestao normativa NIS2 concluida. "
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
        for sequence, match in enumerate(matches, start=1):
            next_start = matches[sequence].start() if sequence < len(matches) else len(raw_text)
            article_raw = raw_text[match.start() : next_start]
            paragraphs = self._paragraphs(article_raw)
            title = self._article_title(paragraphs)
            body = [
                paragraph
                for paragraph in paragraphs
                if not ARTICLE_RE.match(paragraph) and paragraph != title
            ]
            if not body:
                continue
            number = match.group("number")
            articles.append(
                {
                    "sequence": sequence,
                    "article_number": f"{number}.º",
                    "normalized_number": number,
                    "article_title": title,
                    "paragraphs": body,
                    "page_start": self._page_for_offset(page_starts, match.start()),
                    "page_end": self._page_for_offset(page_starts, max(match.start(), next_start - 1)),
                }
            )
        return articles

    def _paragraphs(self, article_raw: str) -> list[str]:
        paragraphs = []
        current = []
        for raw_line in article_raw.replace(PAGE_BREAK, "\n").splitlines():
            line = raw_line.strip()
            if self._is_boilerplate(line):
                continue
            if not line:
                if current:
                    paragraphs.append(self._join_wrapped_lines(current))
                    current = []
                continue
            current.append(line)
        if current:
            paragraphs.append(self._join_wrapped_lines(current))
        return [paragraph for paragraph in paragraphs if paragraph]

    def _article_title(self, paragraphs: list[str]) -> str:
        seen_article = False
        for paragraph in paragraphs:
            if ARTICLE_RE.match(paragraph):
                seen_article = True
                continue
            if seen_article:
                return paragraph
        return "Sem titulo"

    def _is_boilerplate(self, line: str) -> bool:
        if not line:
            return False
        return bool(
            line == "PT"
            or "Jornal Oficial da União Europeia" in line
            or re.match(r"^L\s+\d+/\d+\b", line)
            or re.match(r"^\d{1,2}\.\d{1,2}\.\d{4}$", line)
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

    def _article_blocks(self, article: dict) -> list[dict]:
        blocks = []
        current_number = None
        current_parent_label = None
        current_parent_display = None
        continuation_counts = {}
        for index, paragraph in enumerate(article["paragraphs"], start=1):
            top_match = TOP_LEVEL_RE.match(paragraph)
            letter_match = LETTER_RE.match(paragraph)
            if top_match:
                current_number = top_match.group("number")
                label = current_number
                display_label = f"n.º {current_number}"
                current_parent_label = label
                current_parent_display = display_label
            elif letter_match and current_number:
                letter = letter_match.group("letter").lower()
                label = f"{current_number}{letter}"
                display_label = f"n.º {current_number}, alínea {letter})"
                current_parent_label = label
                current_parent_display = display_label
            elif current_parent_label:
                continuation_counts[current_parent_label] = continuation_counts.get(current_parent_label, 0) + 1
                continuation_index = continuation_counts[current_parent_label]
                label = f"{current_parent_label}-cont-{continuation_index:02d}"
                display_label = f"{current_parent_display} (continuação {continuation_index})"
            else:
                label = f"intro-{index:02d}"
                display_label = "Enquadramento"
                current_parent_label = label
                current_parent_display = display_label

            blocks.append(
                {
                    "sequence": index,
                    "label": label,
                    "display_label": display_label,
                    "text": paragraph,
                }
            )
        return blocks

    def _split_text(self, text: str, max_chars: int) -> list[str]:
        if len(text) <= max_chars:
            return [text]
        sentences = re.split(r"(?<=[.;:])\s+", text)
        segments = []
        current = []
        current_length = 0
        for sentence in sentences:
            projected = current_length + len(sentence) + (1 if current else 0)
            if current and projected > max_chars:
                segments.append(" ".join(current).strip())
                current = [sentence]
                current_length = len(sentence)
            else:
                current.append(sentence)
                current_length = projected
        if current:
            segments.append(" ".join(current).strip())
        return [segment for segment in segments if segment]

    def _source_ref(self, article: dict, block: dict, segment_index: int) -> str:
        label = re.sub(r"[^a-z0-9-]+", "-", str(block["label"]).lower()).strip("-")
        return (
            f"{DOCUMENT_CODE}:article-{article['normalized_number']}:"
            f"seq-{article['sequence']:03d}:block-{block['sequence']:03d}:paragraph-{label}:segment-{segment_index:02d}"
        )

    def _chunk_title(self, article: dict, block: dict, segment_index: int, segment_count: int) -> str:
        suffix = f" - Segmento {segment_index}/{segment_count}" if segment_count > 1 else ""
        return (
            f"NIS2 - Artigo {article['article_number']} - "
            f"{article['article_title']} - {block['display_label']}{suffix}"
        )

    def _chunk_text(self, article: dict, block: dict, segment: str, segment_index: int, segment_count: int) -> str:
        segment_label = f" Segmento {segment_index}/{segment_count}." if segment_count > 1 else ""
        return (
            f"{DOCUMENT_LABEL}. Artigo {article['article_number']} - {article['article_title']}. "
            f"{block['display_label']}.{segment_label}\n\n{segment}"
        )

    def _metadata(
        self,
        pdf_path: Path,
        article: dict,
        block: dict,
        segment_index: int,
        segment_count: int,
    ) -> dict:
        pages = (
            f"p. {article['page_start']}"
            if article["page_start"] == article["page_end"]
            else f"pp. {article['page_start']}-{article['page_end']}"
        )
        segment = f", segmento {segment_index}/{segment_count}" if segment_count > 1 else ""
        anchor_label = re.sub(r"[^a-z0-9-]+", "-", str(block["label"]).lower()).strip("-")
        return {
            "normative_document": DOCUMENT_CODE,
            "document_label": DOCUMENT_LABEL,
            "document_title": DOCUMENT_TITLE,
            "article_number": article["article_number"],
            "article_title": article["article_title"],
            "article_sequence": article["sequence"],
            "paragraph_label": block["label"],
            "paragraph_display": block["display_label"],
            "segment_index": segment_index,
            "segment_count": segment_count,
            "page_start": article["page_start"],
            "page_end": article["page_end"],
            "citation": (
                f"{DOCUMENT_LABEL}, Artigo {article['article_number']} "
                f"({article['article_title']}), {block['display_label']}, {pages}{segment}"
            ),
            "anchor": f"nis2-2022-artigo-{article['normalized_number']}-{anchor_label}-s{segment_index:02d}",
            "source_path": str(pdf_path),
            "source_file": "docs/frameworks/NIS2.pdf",
        }
