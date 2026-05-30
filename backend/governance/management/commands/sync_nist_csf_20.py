import os
import re
import subprocess
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from governance.models import Control, Framework, FrameworkLevel, FrameworkSection


class Command(BaseCommand):
    help = "Sincroniza o NIST CSF 2.0 a partir do PDF oficial em docs/frameworks."

    FUNCTIONS = {
        "GV": "Govern",
        "ID": "Identify",
        "PR": "Protect",
        "DE": "Detect",
        "RS": "Respond",
        "RC": "Recover",
    }

    FUNCTION_PATTERN = re.compile(r"^(GOVERN|IDENTIFY|PROTECT|DETECT|RESPOND|RECOVER) \(([A-Z]{2})\):")
    CATEGORY_PATTERN = re.compile(r"^(.+?) \(([A-Z]{2}\.[A-Z]{2})\):\s*(.*)$")
    CONTROL_PATTERN = re.compile(r"^o\s+([A-Z]{2}\.[A-Z]{2}-\d{2}):\s*(.*)$")
    NOISE_PREFIXES = (
        "NIST CSWP 29",
        "February 26, 2024",
        "The NIST Cybersecurity Framework",
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--pdf",
            default="../docs/frameworks/NIST.CSWP.29.pdf",
            help="Caminho para o PDF NIST CSF 2.0.",
        )
        parser.add_argument("--framework-version", default="2.0", help="Versao da framework a criar/atualizar.")
        parser.add_argument(
            "--deprecate-missing",
            action="store_true",
            help="Marca como deprecated controlos NIST CSF 2.0 que ja nao aparecam no PDF.",
        )
        parser.add_argument(
            "--deactivate-legacy",
            action="store_true",
            help="Desativa frameworks NISTCSF com versao diferente da indicada.",
        )
        parser.add_argument("--dry-run", action="store_true", help="Simula sem gravar alteracoes.")

    def handle(self, *args, **options):
        os.environ.setdefault("VIRTUAL_CISO_DISABLE_RAG_SIGNALS", "1")
        pdf_path = Path(options["pdf"])
        if not pdf_path.is_absolute():
            pdf_path = Path.cwd() / pdf_path
        pdf_path = pdf_path.resolve()

        controls, categories = self._extract_controls(pdf_path)
        if len(controls) < 100:
            raise CommandError(f"Foram extraidos apenas {len(controls)} controlos do NIST CSF 2.0.")

        stats = {
            "framework_created": 0,
            "levels_created": 0,
            "sections_created": 0,
            "sections_updated": 0,
            "controls_created": 0,
            "controls_updated": 0,
            "controls_deprecated": 0,
            "legacy_deactivated": 0,
        }

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry-run ativo: nenhuma alteracao sera gravada."))

        with transaction.atomic():
            framework, created = Framework.objects.update_or_create(
                code=Framework.FrameworkCode.NISTCSF,
                version=options["framework_version"],
                defaults={
                    "name": "NIST Cybersecurity Framework",
                    "publisher": "National Institute of Standards and Technology",
                    "source_uri": "https://doi.org/10.6028/NIST.CSWP.29",
                    "description": "NIST Cybersecurity Framework (CSF) 2.0.",
                    "is_active": True,
                    "published_at": date(2024, 2, 26),
                },
            )
            stats["framework_created"] = int(created)

            levels = self._ensure_levels(framework, stats)
            function_sections = self._ensure_function_sections(framework, levels[1], stats)
            category_sections = self._ensure_category_sections(
                framework,
                levels[2],
                function_sections,
                categories,
                stats,
            )
            self._sync_controls(framework, category_sections, controls, stats)

            if options["deprecate_missing"]:
                stats["controls_deprecated"] = (
                    Control.objects.filter(framework=framework)
                    .exclude(code__in={item["code"] for item in controls})
                    .exclude(status=Control.Status.DEPRECATED)
                    .update(status=Control.Status.DEPRECATED)
                )

            if options["deactivate_legacy"]:
                stats["legacy_deactivated"] = (
                    Framework.objects.filter(code=Framework.FrameworkCode.NISTCSF)
                    .exclude(pk=framework.pk)
                    .exclude(is_active=False)
                    .update(is_active=False)
                )

            if options["dry_run"]:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS("NIST CSF 2.0 sincronizado."))
        self.stdout.write(f"Controlos extraidos do PDF: {len(controls)}")
        for key, value in stats.items():
            self.stdout.write(f"{key}: {value}")

    def _extract_controls(self, pdf_path):
        try:
            text = subprocess.check_output(
                ["pdftotext", str(pdf_path), "-"],
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
        except FileNotFoundError as exc:
            raise CommandError("pdftotext nao esta disponivel no ambiente.") from exc
        except subprocess.CalledProcessError as exc:
            raise CommandError(f"Nao foi possivel ler o PDF NIST CSF: {exc}") from exc

        lines = text.splitlines()
        start = self._find_line(lines, "GOVERN (GV):")
        end = self._find_line(lines, "Appendix B. CSF Tiers", start=start)
        if start is None or end is None:
            raise CommandError("Nao foi possivel localizar o Appendix A do NIST CSF 2.0.")

        controls = []
        categories = {}
        current_category = None
        current_control = None

        def flush_control():
            nonlocal current_control
            if not current_control:
                return
            current_control["description"] = self._clean_text(current_control["description"])
            controls.append(current_control)
            current_control = None

        for raw_line in lines[start:end]:
            line = raw_line.strip()
            if self._is_noise(line):
                continue

            category_match = self.CATEGORY_PATTERN.match(line)
            if category_match:
                flush_control()
                name, code, description = category_match.groups()
                current_category = code
                categories[code] = {
                    "code": code,
                    "name": self._clean_text(name),
                    "description": self._clean_text(description),
                    "function": code.split(".", 1)[0],
                }
                continue

            function_match = self.FUNCTION_PATTERN.match(line)
            if function_match:
                flush_control()
                current_category = None
                continue

            control_match = self.CONTROL_PATTERN.match(line)
            if control_match:
                flush_control()
                code, description = control_match.groups()
                current_control = {
                    "code": code,
                    "category": code.rsplit("-", 1)[0],
                    "description": description,
                }
                continue

            if current_control and line:
                current_control["description"] += f" {line}"
            elif current_category and line and current_category in categories:
                categories[current_category]["description"] = self._clean_text(
                    f"{categories[current_category]['description']} {line}"
                )

        flush_control()
        unique_controls = {item["code"]: item for item in controls}
        return list(unique_controls.values()), categories

    def _find_line(self, lines, needle, start=0):
        if start is None:
            start = 0
        for index in range(start, len(lines)):
            if needle in lines[index]:
                return index
        return None

    def _is_noise(self, line):
        if not line or line == "•" or line.isdigit():
            return True
        return any(line.startswith(prefix) for prefix in self.NOISE_PREFIXES)

    def _clean_text(self, value):
        return re.sub(r"\s+", " ", str(value or "")).strip()

    def _ensure_levels(self, framework, stats):
        levels = {}
        for level, name in ((1, "Function"), (2, "Category"), (3, "Subcategory")):
            level_obj, created = FrameworkLevel.objects.get_or_create(
                framework=framework,
                level=level,
                defaults={"name": name, "description": f"NIST CSF 2.0 {name}."},
            )
            if created:
                stats["levels_created"] += 1
            levels[level] = level_obj
        return levels

    def _ensure_function_sections(self, framework, level_ref, stats):
        sections = {}
        for order, (code, name) in enumerate(self.FUNCTIONS.items(), start=1):
            section, created = FrameworkSection.objects.update_or_create(
                framework=framework,
                code=code,
                defaults={
                    "name": name,
                    "parent": None,
                    "level": 1,
                    "level_ref": level_ref,
                    "sort_order": order,
                },
            )
            stats["sections_created" if created else "sections_updated"] += 1
            sections[code] = section
        return sections

    def _ensure_category_sections(self, framework, level_ref, function_sections, categories, stats):
        sections = {}
        for order, category in enumerate(sorted(categories.values(), key=lambda item: item["code"]), start=1):
            parent = function_sections.get(category["function"])
            section, created = FrameworkSection.objects.update_or_create(
                framework=framework,
                code=category["code"],
                defaults={
                    "name": category["name"],
                    "parent": parent,
                    "level": 2,
                    "level_ref": level_ref,
                    "sort_order": order,
                },
            )
            stats["sections_created" if created else "sections_updated"] += 1
            sections[category["code"]] = section
        return sections

    def _sync_controls(self, framework, category_sections, controls, stats):
        for item in controls:
            section = category_sections.get(item["category"])
            if not section:
                continue
            title = self._fit(Control, "title", item["description"])
            _control, created = Control.objects.update_or_create(
                framework=framework,
                code=item["code"],
                defaults={
                    "section": section,
                    "title": title,
                    "description": item["description"],
                    "implementation_guidance": "",
                    "is_mandatory": False,
                    "applicability_scope": "organization",
                    "status": Control.Status.ACTIVE,
                },
            )
            stats["controls_created" if created else "controls_updated"] += 1

    def _fit(self, model, field_name, value):
        max_length = model._meta.get_field(field_name).max_length
        text = str(value or "").strip()
        return text[:max_length] if max_length else text
