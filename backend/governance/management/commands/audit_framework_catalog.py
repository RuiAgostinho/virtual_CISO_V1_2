import re
import subprocess
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db.models import Count

from governance.models import Control, Framework, InternalControl, InternalControlFrameworkMapping


class Command(BaseCommand):
    help = "Audita cobertura de frameworks, controlos externos e mappings para controlos internos."

    def add_arguments(self, parser):
        parser.add_argument(
            "--docs-dir",
            default="../docs/frameworks",
            help="Pasta com PDFs das frameworks de referência.",
        )

    def handle(self, *args, **options):
        docs_dir = Path(options["docs_dir"])
        if not docs_dir.is_absolute():
            docs_dir = Path.cwd() / docs_dir
        docs_dir = docs_dir.resolve()

        self.stdout.write(self.style.SUCCESS("Auditoria de frameworks"))
        self._print_docs(docs_dir)
        self._print_frameworks()
        self._print_mapping_quality()
        self._print_reference_checks(docs_dir)

    def _print_docs(self, docs_dir):
        self.stdout.write("\nFicheiros em docs/frameworks:")
        if not docs_dir.exists():
            self.stdout.write(self.style.WARNING(f"Pasta nao encontrada: {docs_dir}"))
            return
        for path in sorted(docs_dir.glob("*")):
            if path.is_file():
                self.stdout.write(f"- {path.name} ({path.stat().st_size} bytes)")

    def _print_frameworks(self):
        self.stdout.write("\nFrameworks na BD:")
        for framework in Framework.objects.order_by("code", "version"):
            controls = Control.objects.filter(framework=framework).count()
            mapped = (
                Control.objects.filter(
                    framework=framework,
                    internal_control_mappings__validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
                )
                .distinct()
                .count()
            )
            self.stdout.write(
                f"- {framework.code} {framework.version}: {controls} controlos, "
                f"{mapped} com mapping aprovado, active={framework.is_active}"
            )

    def _print_mapping_quality(self):
        self.stdout.write("\nQualidade dos mappings:")
        total = InternalControlFrameworkMapping.objects.count()
        approved = InternalControlFrameworkMapping.objects.filter(
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED
        ).count()
        pending = InternalControlFrameworkMapping.objects.filter(
            validation_status=InternalControlFrameworkMapping.ValidationStatus.PENDING_REVIEW
        ).count()
        missing_rationale = InternalControlFrameworkMapping.objects.filter(rationale="").count()
        inactive_internal = (
            InternalControl.objects.filter(is_active=True)
            .exclude(framework_mappings__validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED)
            .distinct()
            .count()
        )
        self.stdout.write(f"- mappings totais: {total}")
        self.stdout.write(f"- approved: {approved}")
        self.stdout.write(f"- pending_review: {pending}")
        self.stdout.write(f"- sem rationale: {missing_rationale}")
        self.stdout.write(f"- controlos internos ativos sem mapping aprovado: {inactive_internal}")

        self.stdout.write("\nMappings por origem/estado:")
        for row in (
            InternalControlFrameworkMapping.objects.values("mapping_source", "validation_status")
            .annotate(n=Count("id"))
            .order_by("mapping_source", "validation_status")
        ):
            self.stdout.write(f"- {row['mapping_source']} / {row['validation_status']}: {row['n']}")

    def _print_reference_checks(self, docs_dir):
        self.stdout.write("\nChecks contra documentos:")
        self._check_iso27002()
        self._check_nist20(docs_dir / "NIST.CSWP.29.pdf")
        self._check_qnrc(docs_dir / "cncs-qnrcs-2019.pdf")

    def _check_iso27002(self):
        framework = Framework.objects.filter(code=Framework.FrameworkCode.ISO27002, version="2022").first()
        if not framework:
            self.stdout.write("- ISO27002: nao existe na BD")
            return
        expected = {
            *(f"A.5.{i}" for i in range(1, 38)),
            *(f"B.6.{i}" for i in range(1, 9)),
            *(f"C.7.{i}" for i in range(1, 15)),
            *(f"D.8.{i}" for i in range(1, 35)),
        }
        self._compare_codes("ISO27002 2022", expected, framework)

    def _check_nist20(self, pdf_path):
        framework = Framework.objects.filter(code=Framework.FrameworkCode.NISTCSF, version="2.0").first()
        if not framework:
            self.stdout.write("- NISTCSF 2.0: ainda nao existe na BD")
            return
        pdf_codes = self._extract_pdf_codes(pdf_path, r"\b[A-Z]{2}\.[A-Z]{2}-\d{2}\b")
        self._compare_codes("NISTCSF 2.0", pdf_codes, framework)

    def _check_qnrc(self, pdf_path):
        framework = Framework.objects.filter(code=Framework.FrameworkCode.QNRC).first()
        if not framework:
            self.stdout.write("- QNRC: nao existe na BD")
            return
        pdf_codes = self._extract_pdf_codes(pdf_path, r"\b[A-Z]{2}\.[A-Z]{2}-\d+\b")
        self._compare_codes(f"QNRC {framework.version}", pdf_codes, framework)

    def _extract_pdf_codes(self, pdf_path, pattern):
        if not pdf_path.exists():
            return set()
        try:
            text = subprocess.check_output(
                ["pdftotext", str(pdf_path), "-"],
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
        except Exception:
            return set()
        return set(re.findall(pattern, text))

    def _compare_codes(self, label, expected, framework):
        db_codes = set(Control.objects.filter(framework=framework).values_list("code", flat=True))
        missing = sorted(expected - db_codes)
        extra = sorted(db_codes - expected)
        self.stdout.write(
            f"- {label}: esperado={len(expected)}, bd={len(db_codes)}, "
            f"missing={len(missing)}, extra={len(extra)}"
        )
        if missing[:10]:
            self.stdout.write(f"  missing sample: {', '.join(missing[:10])}")
        if extra[:10]:
            self.stdout.write(f"  extra sample: {', '.join(extra[:10])}")
