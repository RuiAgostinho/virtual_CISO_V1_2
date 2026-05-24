import json
import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from ciso_assistant.models import AssistantRecommendation, KnowledgeChunk
from ciso_assistant.services.governance_context_adapter import GovernanceContextAdapter
from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from ciso_assistant.services.orchestrator import QueryOrchestrator
from ciso_assistant.services.policy_advice_service import PolicyAdviceService
from ciso_assistant.services.prompt_builder import PromptBuilder
from ciso_assistant.services.rag_ingestion_runner import RagIngestionRunner
from ciso_assistant.services.semantic_retrieval import SemanticRetrievalService
from ciso_assistant.services.source_normalizer import SourceNormalizer
from ciso_assistant.services.structured_service import StructuredQueryService
from ciso_assistant.views import _rag_stats
from governance.models import (
    Control,
    EvidenceItem,
    EvidenceLink,
    Framework,
    FrameworkSection,
    GovernanceAction,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceDocumentSection,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
    RunbookStep,
)


class GovernanceContextAdapterTests(TestCase):
    def setUp(self):
        self.framework = Framework.objects.create(
            code=Framework.FrameworkCode.ISO27001,
            name="ISO/IEC 27001",
            version="2022",
        )
        self.section = FrameworkSection.objects.create(
            framework=self.framework,
            code="A.5",
            name="Organizational controls",
            level=1,
        )
        self.framework_control = Control.objects.create(
            framework=self.framework,
            section=self.section,
            code="A.5.15",
            title="Access control",
            description="External framework access control.",
            status=Control.Status.ACTIVE,
        )
        self.internal_control = InternalControl.objects.create(
            code="IC-IAM-001",
            title="Controlo interno de acessos privilegiados",
            description="Define requisitos internos para acessos privilegiados.",
            control_domain="Gestao de acessos",
            objective="Reduzir uso indevido de contas privilegiadas.",
            risk_statement="Acesso privilegiado indevido pode causar impacto elevado.",
            status=InternalControl.Status.ACTIVE,
            criticality=InternalControl.Criticality.HIGH,
        )
        InternalControlFrameworkMapping.objects.create(
            internal_control=self.internal_control,
            framework_control=self.framework_control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
            rationale="Internal access control maps to ISO access control.",
        )
        self.policy = Policy.objects.create(
            code="POL-IAM",
            title="Politica de Controlo de Acessos",
            status=Policy.Status.ACTIVE,
            objective="Governar acessos.",
        )
        PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        self.mechanism = Mechanism.objects.create(
            title="MFA",
            description="Autenticacao multifator.",
        )
        InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
            implementation_status=InternalControlMechanism.ImplementationStatus.IMPLEMENTED,
            contribution_weight=100,
            mandatory=True,
        )
        self.document = GovernanceDocument.objects.create(
            title="Norma de Controlo de Acessos",
            document_type=GovernanceDocument.DocumentType.STANDARD,
            status=GovernanceDocument.Status.APPROVED,
            purpose="Definir requisitos de acessos.",
        )
        GovernanceDocumentControl.objects.create(
            document=self.document,
            internal_control=self.internal_control,
            purpose=GovernanceDocumentControl.Purpose.IMPLEMENTS,
            validation_status=GovernanceDocumentControl.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        self.action = GovernanceAction.objects.create(
            action_type=GovernanceAction.ActionType.IMPLEMENT_MECHANISM,
            title="Implementar MFA nos acessos privilegiados",
            description="Ativar MFA, validar excecoes e documentar evidencias.",
            recommendation="Priorizar administradores e acessos remotos.",
            target_type="mechanism",
            target_id=str(self.mechanism.id),
            owner="CISO",
            priority=GovernanceAction.Priority.HIGH,
            status=GovernanceAction.Status.OPEN,
            evidence_required=True,
            expected_evidence="Relatorio de MFA ativo e ticket de aprovacao.",
            required_roles="CISO; Administrador IAM",
            required_materials="Tenant IAM; ferramenta MFA",
            notes="Confirmar grupos privilegiados, ativar MFA e recolher evidencias.",
            score_impact=15,
        )

    def test_retrieves_internal_control_context_before_external_framework_context(self):
        chunks = GovernanceContextAdapter.retrieve_internal_first(
            "Que controlos ISO mitigam acessos privilegiados?",
            top_k=5,
        )

        self.assertGreater(len(chunks), 0)
        self.assertEqual(chunks[0]["source_type"], "internal_control")
        self.assertEqual(chunks[0]["metadata"]["internal_control_code"], "IC-IAM-001")
        self.assertIn("Controlo interno", chunks[0]["chunk_text"])
        self.assertIn("POL-IAM", chunks[0]["chunk_text"])
        self.assertIn("MFA", chunks[0]["chunk_text"])
        self.assertIn("ISO27001 2022:A.5.15", chunks[0]["chunk_text"])

    def test_does_not_inject_governance_context_for_pure_vulnerability_queries(self):
        chunks = GovernanceContextAdapter.retrieve_internal_first(
            "Analisa o risco desta vulnerabilidade num ativo critico",
            top_k=5,
        )

        self.assertEqual(chunks, [])

    def test_retrieves_governance_actions_for_operational_task_queries(self):
        chunks = GovernanceContextAdapter.retrieve_internal_first(
            "Que tarefas tenho para implementar MFA e que prazos devo acompanhar?",
            top_k=5,
        )

        source_types = [chunk["source_type"] for chunk in chunks]
        self.assertIn("governance_action", source_types)
        action_chunk = next(chunk for chunk in chunks if chunk["source_type"] == "governance_action")
        self.assertEqual(action_chunk["metadata"]["governance_action_id"], str(self.action.id))
        self.assertIn("Implementar MFA", action_chunk["chunk_text"])
        self.assertIn("Relatorio de MFA ativo", action_chunk["chunk_text"])

    @patch("ciso_assistant.services.orchestrator.OllamaClient.call", return_value="Resposta internal-first.")
    @patch(
        "ciso_assistant.services.orchestrator.SemanticRetrievalService.semantic_search",
        return_value=[
            {
                "title": "A.5.15 - Access control",
                "chunk_text": "Controlo externo ISO para access control.",
                "source_type": "control",
                "source_ref": "external-control",
                "framework": "ISO27001 2022",
                "control_code": "A.5.15",
                "distance": 0.2,
                "metadata": {"control_id": "external-control"},
            }
        ],
    )
    @patch(
        "ciso_assistant.services.orchestrator.LLMRouter.detect_task_type",
        return_value={
            "task_type": "control_mapping",
            "confidence": 1.0,
            "needs_rag": True,
            "model_used": "qwen2.5:7b-instruct",
        },
    )
    def test_orchestrator_prepends_governance_context_without_changing_router(
        self,
        router_mock,
        semantic_mock,
        ollama_mock,
    ):
        result = QueryOrchestrator.process_query("Que controlos ISO mitigam acessos privilegiados?")

        self.assertTrue(result["used_rag"])
        self.assertEqual(result["sources"][0]["source_type"], "internal_control")
        self.assertEqual(result["sources"][0]["source_label"], "Controlo interno")
        self.assertTrue(result["sources"][0]["is_internal_governance"])
        self.assertTrue(any(source["source_type"] == "control" for source in result["sources"]))
        router_mock.assert_called_once()
        semantic_mock.assert_called_once()
        ollama_mock.assert_called_once()

    def test_structured_control_count_uses_internal_controls_first(self):
        result = StructuredQueryService.run_structured_query("Quantos controlos tenho?")

        self.assertEqual(result["type"], "internal_control_count")
        self.assertEqual(result["value"], 1)
        self.assertIn("controlos internos", result["raw_text"])
        self.assertIn("agnosticos de frameworks", result["raw_text"])

    def test_structured_control_list_uses_internal_control_labels(self):
        result = StructuredQueryService.run_structured_query("Lista os controlos")

        self.assertEqual(result["type"], "internal_control_list")
        self.assertIn("IC-IAM-001", result["raw_text"])
        self.assertIn("catalogo interno", result["raw_text"])

    def test_structured_compliance_uses_propagation_engine_when_internal_layer_exists(self):
        result = StructuredQueryService.run_structured_query("Qual e o score de conformidade por framework?")

        self.assertEqual(result["type"], "propagation_framework_score_summary")
        self.assertIn("propagacao", result["raw_text"])
        self.assertIn("controlos internos", result["raw_text"])
        self.assertIn("ISO27001", result["raw_text"])

    @patch("ciso_assistant.services.knowledge_ingestion.EmbeddingService.get_embedding")
    def test_ingests_new_governance_layer_sources(self, embedding_mock):
        embedding_mock.return_value = [0.01] * 4096
        section = GovernanceDocumentSection.objects.create(
            document=self.document,
            section_number="1",
            title="Requisitos de acesso",
            content="A norma exige MFA para acessos privilegiados.",
            order=1,
        )
        evidence = EvidenceItem.objects.create(
            title="Relatorio de MFA",
            description="Exportacao que comprova MFA ativo.",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            status=EvidenceItem.Status.VALID,
            confidence_level=95,
        )
        mapping = self.internal_control.framework_mappings.get()
        mechanism_link = self.internal_control.mechanism_links.get()

        self.assertTrue(KnowledgeIngestionService.upsert_internal_control(self.internal_control))
        self.assertTrue(KnowledgeIngestionService.upsert_governance_document(self.document))
        self.assertTrue(KnowledgeIngestionService.upsert_governance_section(section))
        self.assertTrue(KnowledgeIngestionService.upsert_evidence_item(evidence))
        self.assertTrue(KnowledgeIngestionService.upsert_framework_mapping(mapping))
        self.assertTrue(KnowledgeIngestionService.upsert_internal_control_mechanism(mechanism_link))
        self.assertTrue(KnowledgeIngestionService.upsert_governance_action(self.action))

        source_types = set(KnowledgeChunk.objects.values_list("source_type", flat=True))
        self.assertTrue(
            {
                "internal_control",
                "governance_document",
                "governance_section",
                "evidence_item",
                "framework_mapping",
                "internal_control_mechanism",
                "governance_action",
            }.issubset(source_types)
        )
        internal_chunk = KnowledgeChunk.objects.get(
            source_type="internal_control",
            source_ref=str(self.internal_control.id),
        )
        self.assertEqual(internal_chunk.metadata_json["internal_control_code"], "IC-IAM-001")
        self.assertIn("Controlo interno", internal_chunk.chunk_text)
        action_chunk = KnowledgeChunk.objects.get(
            source_type="governance_action",
            source_ref=str(self.action.id),
        )
        self.assertEqual(action_chunk.metadata_json["action_type"], GovernanceAction.ActionType.IMPLEMENT_MECHANISM)
        self.assertIn("Tarefa de governacao", action_chunk.chunk_text)

    def test_semantic_retrieval_infers_new_governance_source_types(self):
        source_types = SemanticRetrievalService.infer_source_types("Que politicas e documentos tenho no SGSI?")

        self.assertIn("governance_document", source_types)
        self.assertIn("governance_section", source_types)
        self.assertIn("policy", source_types)

        task_source_types = SemanticRetrievalService.infer_source_types("Que tarefas e prazos tenho para implementar MFA?")
        self.assertIn("governance_action", task_source_types)

    def test_source_normalizer_distinguishes_internal_and_external_sources(self):
        internal_source = SourceNormalizer.normalize(
            {
                "title": "IC-IAM-001 - Controlo interno",
                "source_type": "internal_control",
                "source_ref": "internal-1",
                "chunk_text": "Controlo interno de acessos.",
            }
        )
        external_source = SourceNormalizer.normalize(
            {
                "title": "A.5.15 - Access control",
                "source_type": "control",
                "source_ref": "external-1",
                "chunk_text": "Controlo externo ISO.",
            }
        )

        self.assertEqual(internal_source["source_label"], "Controlo interno")
        self.assertEqual(internal_source["governance_layer"], "internal_governance")
        self.assertTrue(internal_source["is_internal_governance"])
        self.assertFalse(internal_source["is_external_framework"])
        self.assertEqual(external_source["source_label"], "Controlo externo/framework")
        self.assertEqual(external_source["governance_layer"], "external_framework")
        self.assertFalse(external_source["is_internal_governance"])
        self.assertTrue(external_source["is_external_framework"])
        action_source = SourceNormalizer.normalize(
            {
                "title": "Implementar MFA",
                "source_type": "governance_action",
                "source_ref": "action-1",
                "chunk_text": "Tarefa de governacao para implementar MFA.",
            }
        )
        self.assertEqual(action_source["source_label"], "Tarefa de governacao")
        self.assertTrue(action_source["is_internal_governance"])

    def test_prompt_builder_labels_sources_and_keeps_internal_first_precedence(self):
        prompt = PromptBuilder.build_system_prompt(
            task_type="control_mapping",
            needs_rag=True,
            retrieved_chunks=[
                {
                    "title": "IC-IAM-001 - Controlo interno",
                    "source_type": "internal_control",
                    "control_code": "IC-IAM-001",
                    "chunk_text": "Controlo interno de acessos privilegiados.",
                },
                {
                    "title": "A.5.15 - Access control",
                    "source_type": "control",
                    "framework": "ISO27001 2022",
                    "control_code": "A.5.15",
                    "chunk_text": "Controlo externo ISO.",
                },
            ],
        )

        self.assertIn("[Controlo interno] Layer: internal_governance", prompt)
        self.assertIn("[Controlo externo/framework] Layer: external_framework", prompt)
        self.assertIn("Treat internal governance records as the primary organizational truth", prompt)
        self.assertIn("Never describe an external framework control as if it were an internal organizational control", prompt)

    def test_evaluate_governance_rag_command_reports_internal_first_metrics(self):
        dataset = [
            {
                "query": "Que controlos ISO mitigam acessos privilegiados?",
                "expected_task_type": "control_mapping",
                "expected_needs_rag": True,
                "expected_first_source_type": "internal_control",
                "expected_source_types": ["internal_control"],
                "expected_source_labels": ["Controlo interno"],
                "expected_prompt_terms": ["SOURCE PRECEDENCE", "external framework controls"],
            }
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            dataset_path = Path(temp_dir) / "governance_rag_eval.json"
            dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
            out = StringIO()

            call_command("evaluate_governance_rag", dataset=str(dataset_path), stdout=out)

        output = out.getvalue()
        self.assertIn("Avaliacao RAG governance internal-first", output)
        self.assertIn("Acuracia exata funcional: 1/1 = 100.00%", output)

    def test_rag_stats_exposes_governance_missing_counts(self):
        stats = _rag_stats()
        governance_rows = {row["source_type"]: row for row in stats["governance_missing"]}

        self.assertEqual(governance_rows["framework_mapping"]["eligible"], 1)
        self.assertEqual(governance_rows["framework_mapping"]["indexed"], 0)
        self.assertEqual(governance_rows["framework_mapping"]["missing"], 1)
        self.assertEqual(governance_rows["internal_control_mechanism"]["eligible"], 1)
        self.assertEqual(governance_rows["internal_control_mechanism"]["indexed"], 0)
        self.assertEqual(governance_rows["internal_control_mechanism"]["missing"], 1)
        self.assertEqual(governance_rows["governance_action"]["eligible"], 1)
        self.assertEqual(governance_rows["governance_action"]["indexed"], 0)
        self.assertEqual(governance_rows["governance_action"]["missing"], 1)

    def test_rag_runner_missing_only_plan_filters_existing_governance_chunks(self):
        mapping = self.internal_control.framework_mappings.get()
        KnowledgeChunk.objects.create(
            title="Existing mapping chunk",
            content="Existing mapping chunk",
            chunk_text="Existing mapping chunk",
            source_type="framework_mapping",
            source_ref=str(mapping.id),
        )

        plan = RagIngestionRunner._plan(
            source_types=("framework_mapping", "internal_control_mechanism", "governance_action"),
            missing_only=True,
            per_type_limit=10,
        )
        querysets = {source_type: list(queryset) for source_type, queryset, _upsert in plan}

        self.assertEqual(querysets["framework_mapping"], [])
        self.assertEqual(len(querysets["internal_control_mechanism"]), 1)
        self.assertEqual(len(querysets["governance_action"]), 1)

    def test_policy_advice_service_builds_internal_first_query_from_draft_sections(self):
        query = PolicyAdviceService.build_query(
            policy_id=str(self.policy.id),
            advice_mode="auditability",
            snapshot={
                "code": "POL-IAM",
                "title": "Politica de Controlo de Acessos",
                "version": "1.0",
                "status": "draft",
                "owner": "CISO",
                "sections": [
                    {
                        "section_number": "1",
                        "title": "Objetivo",
                        "content": "Definir regras para controlo de acessos e MFA.",
                    }
                ],
            },
        )

        self.assertIn("consultor CISO", query)
        self.assertIn("Usa primeiro a camada interna", query)
        self.assertIn("Controlos internos associados", query)
        self.assertIn("IC-IAM-001", query)
        self.assertIn("Definir regras para controlo de acessos", query)

    def test_policy_advice_service_draft_text_prioritizes_ready_to_use_wording(self):
        query = PolicyAdviceService.build_query(
            policy_id=str(self.policy.id),
            advice_mode="draft_text",
            snapshot={
                "code": "POL-IAM",
                "title": "Politica de Controlo de Acessos",
                "sections": [
                    {"section_number": "1", "title": "Descricao", "content": ""},
                    {"section_number": "2", "title": "Objetivo", "content": "Definir diretrizes."},
                ],
            },
        )

        self.assertIn("texto normativo pronto a copiar", query)
        self.assertIn("Texto pronto a colar - Descricao", query)
        self.assertIn("Se uma secao estiver vazia", query)

    @override_settings(OLLAMA_POLICY_ADVICE_MODEL="qwen2.5:7b-instruct")
    @patch("ciso_assistant.views.SemanticRetrievalService.semantic_search", return_value=[])
    @patch("ciso_assistant.views.OllamaClient.call", return_value="Recomendacao CISO fundamentada.")
    def test_policy_advice_endpoint_uses_existing_assistant_pipeline(self, ollama_mock, semantic_mock):
        user = get_user_model().objects.create_user(
            username="advisor",
            email="advisor@example.com",
            password="pass12345",
        )
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            "/api/assistant/policy-advice/",
            data={
                "policy_id": str(self.policy.id),
                "advice_mode": "full_review",
                "policy_snapshot": {
                    "code": "POL-IAM",
                    "title": "Politica de Controlo de Acessos",
                    "sections": [
                        {
                            "section_number": "1",
                            "title": "Objetivo",
                            "content": "Definir regras para acessos.",
                        }
                    ],
                },
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["response"], "Recomendacao CISO fundamentada.")
        self.assertEqual(response.json()["model_used"], "qwen2.5:7b-instruct")
        ollama_mock.assert_called_once()
        self.assertEqual(ollama_mock.call_args.kwargs["model"], "qwen2.5:7b-instruct")
        semantic_mock.assert_called_once()
        query_arg = ollama_mock.call_args.kwargs["prompt"]
        self.assertIn("Politica de Controlo de Acessos", query_arg)
        self.assertIn("camada interna", query_arg)
        self.assertEqual(AssistantRecommendation.objects.count(), 1)

    def test_policy_internal_control_signal_reindexes_policy_and_internal_control(self):
        second_control = InternalControl.objects.create(
            code="IC-IAM-002",
            title="Revisao periodica de acessos",
            description="Controla revisoes periodicas de acessos.",
            status=InternalControl.Status.ACTIVE,
        )

        with (
            patch.object(KnowledgeIngestionService, "upsert_policy", return_value=True) as policy_mock,
            patch.object(
                KnowledgeIngestionService,
                "upsert_internal_control",
                return_value=True,
            ) as control_mock,
        ):
            with self.captureOnCommitCallbacks(execute=True):
                PolicyInternalControl.objects.create(
                    policy=self.policy,
                    internal_control=second_control,
                    rationale="A politica deve cobrir revisoes periodicas.",
                )

        policy_mock.assert_any_call(self.policy.id)
        control_mock.assert_any_call(second_control.id)

    def test_governance_document_control_signal_reindexes_document_and_internal_control(self):
        second_control = InternalControl.objects.create(
            code="IC-DOC-001",
            title="Requisito documental interno",
            description="Garante que documentos normativos referenciam controlos internos.",
            status=InternalControl.Status.ACTIVE,
        )

        with (
            patch.object(
                KnowledgeIngestionService,
                "upsert_governance_document",
                return_value=True,
            ) as document_mock,
            patch.object(
                KnowledgeIngestionService,
                "upsert_internal_control",
                return_value=True,
            ) as control_mock,
        ):
            with self.captureOnCommitCallbacks(execute=True):
                GovernanceDocumentControl.objects.create(
                    document=self.document,
                    internal_control=second_control,
                    purpose=GovernanceDocumentControl.Purpose.IMPLEMENTS,
                    rationale="Documento operacionaliza o controlo interno.",
                )

        document_mock.assert_any_call(self.document.id)
        control_mock.assert_any_call(second_control.id)

    def test_runbook_step_signal_reindexes_parent_governance_document(self):
        runbook = GovernanceDocument.objects.create(
            title="Runbook de exportacao de evidencias",
            document_type=GovernanceDocument.DocumentType.RUNBOOK,
            status=GovernanceDocument.Status.DRAFT,
        )

        with patch.object(
            KnowledgeIngestionService,
            "upsert_governance_document",
            return_value=True,
        ) as document_mock:
            with self.captureOnCommitCallbacks(execute=True):
                RunbookStep.objects.create(
                    runbook=runbook,
                    step_number=1,
                    title="Exportar relatorio",
                    description="Exportar relatorio de configuracao.",
                    expected_output="Relatorio anexado.",
                    evidence_required=True,
                )

        document_mock.assert_any_call(runbook.id)

    def test_evidence_link_signal_reindexes_evidence_and_governance_target(self):
        evidence = EvidenceItem.objects.create(
            title="Evidencia de MFA",
            description="Relatorio que demonstra MFA ativo.",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            status=EvidenceItem.Status.VALID,
            confidence_level=90,
        )

        with (
            patch.object(
                KnowledgeIngestionService,
                "upsert_evidence_item",
                return_value=True,
            ) as evidence_mock,
            patch.object(KnowledgeIngestionService, "upsert_mechanism", return_value=True) as mechanism_mock,
        ):
            with self.captureOnCommitCallbacks(execute=True):
                EvidenceLink.objects.create(
                    evidence_item=evidence,
                    target_type=EvidenceLink.TargetType.MECHANISM,
                    target_id=self.mechanism.id,
                    link_type=EvidenceLink.LinkType.EVIDENCES,
                    rationale="A evidencia suporta o mecanismo MFA.",
                )

        evidence_mock.assert_any_call(evidence.id)
        mechanism_mock.assert_any_call(self.mechanism.id)

    def test_governance_action_signal_reindexes_task(self):
        with patch.object(
            KnowledgeIngestionService,
            "upsert_governance_action",
            return_value=True,
        ) as action_mock:
            with self.captureOnCommitCallbacks(execute=True):
                self.action.status = GovernanceAction.Status.IN_PROGRESS
                self.action.save(update_fields=["status", "updated_at"])

        action_mock.assert_any_call(self.action.id)


class StructuredQueryLegacyFallbackTests(TestCase):
    def test_control_count_falls_back_to_external_controls_without_internal_catalog(self):
        framework = Framework.objects.create(
            code=Framework.FrameworkCode.ISO27001,
            name="ISO/IEC 27001",
            version="2022",
        )
        section = FrameworkSection.objects.create(
            framework=framework,
            code="A.5",
            name="Organizational controls",
            level=1,
        )
        Control.objects.create(
            framework=framework,
            section=section,
            code="A.5.15",
            title="Access control",
            description="External framework access control.",
            status=Control.Status.ACTIVE,
        )

        result = StructuredQueryService.run_structured_query("Quantos controlos tenho?")

        self.assertEqual(result["type"], "control_count")
        self.assertEqual(result["value"], 1)
