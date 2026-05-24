import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { GovernanceBadge } from "@/components/governance/GovernancePrimitives";
import {
  governanceApi,
  type GovernanceException,
  type GovernanceExceptionStatus,
  type GovernanceExceptionTargetType,
  type GovernanceExceptionType,
} from "@/lib/governanceApi";
import { mappingReviewApi, type SearchOption } from "@/lib/mappingReviewApi";

type ExceptionFormState = {
  exception_type: GovernanceExceptionType;
  target_type: GovernanceExceptionTargetType;
  target_id: string;
  title: string;
  description: string;
  business_justification: string;
  compensating_control_description: string;
  risk_impact: string;
  compliance_impact: string;
  score_impact: string;
  valid_from: string;
  valid_until: string;
  owner: string;
  approver: string;
  evidence_reference: string;
  action_reference: string;
};

const exceptionTypeLabels: Record<GovernanceExceptionType, string> = {
  policy_exception: "Exceção a política",
  control_exception: "Exceção a controlo",
  risk_acceptance: "Aceitação temporária de risco",
  implementation_delay: "Adiamento de implementação",
  compensating_control: "Controlo compensatório",
};

const targetTypeLabels: Record<GovernanceExceptionTargetType, string> = {
  policy: "Política",
  internal_control: "Controlo interno",
  framework_control: "Controlo externo/framework",
  mechanism: "Mecanismo",
  internal_control_mechanism: "Mecanismo aplicado a controlo",
  governance_document: "Documento de governação",
  risk: "Risco",
  asset: "Ativo",
  vulnerability: "Vulnerabilidade",
};

const statusLabels: Record<GovernanceExceptionStatus, string> = {
  draft: "Rascunho",
  pending_review: "Por validar",
  approved: "Aprovada",
  rejected: "Rejeitada",
  expired: "Expirada",
  revoked: "Revogada",
};

const statusTone: Record<GovernanceExceptionStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  pending_review: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  expired: "border-orange-200 bg-orange-50 text-orange-700",
  revoked: "border-slate-300 bg-slate-100 text-slate-700",
};

const searchableTargetTypes = new Set<GovernanceExceptionTargetType>([
  "policy",
  "internal_control",
  "framework_control",
  "mechanism",
  "governance_document",
]);

const initialForm: ExceptionFormState = {
  exception_type: "risk_acceptance",
  target_type: "internal_control",
  target_id: "",
  title: "",
  description: "",
  business_justification: "",
  compensating_control_description: "",
  risk_impact: "",
  compliance_impact: "",
  score_impact: "0",
  valid_from: "",
  valid_until: "",
  owner: "",
  approver: "",
  evidence_reference: "",
  action_reference: "",
};

function normalize<T>(payload: { results?: T[] } | T[]): T[] {
  return Array.isArray(payload) ? payload : payload.results || [];
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function apiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Erro desconhecido");
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShieldAlert;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className={`mb-5 h-5 w-5 ${tone}`} />
      <div className="text-3xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-black uppercase text-slate-400">{label}</div>
    </div>
  );
}

export default function GovernanceExceptions() {
  const [records, setRecords] = useState<GovernanceException[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GovernanceExceptionStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<GovernanceExceptionType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ExceptionFormState>(initialForm);
  const [targetSearch, setTargetSearch] = useState("");
  const [targetOptions, setTargetOptions] = useState<SearchOption[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.listGovernanceExceptions({ page_size: 200 });
      setRecords(normalize(data));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    let cancelled = false;
    async function searchTargets() {
      if (!searchableTargetTypes.has(form.target_type)) {
        setTargetOptions([]);
        return;
      }
      setLoadingTargets(true);
      try {
        let options: SearchOption[] = [];
        if (form.target_type === "policy") {
          options = await mappingReviewApi.searchPolicies(targetSearch);
        } else if (form.target_type === "internal_control") {
          options = await mappingReviewApi.searchInternalControls(targetSearch, { include_migrated: true });
        } else if (form.target_type === "framework_control") {
          options = await mappingReviewApi.searchFrameworkControls(targetSearch);
        } else if (form.target_type === "mechanism") {
          options = await mappingReviewApi.searchMechanisms(targetSearch);
        } else if (form.target_type === "governance_document") {
          options = await mappingReviewApi.searchGovernanceDocuments(targetSearch);
        }
        if (!cancelled) setTargetOptions(options);
      } catch {
        if (!cancelled) setTargetOptions([]);
      } finally {
        if (!cancelled) setLoadingTargets(false);
      }
    }
    const timer = window.setTimeout(() => void searchTargets(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.target_type, targetSearch]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const statusOk = statusFilter === "all" || record.approval_status === statusFilter;
      const typeOk = typeFilter === "all" || record.exception_type === typeFilter;
      return statusOk && typeOk;
    });
  }, [records, statusFilter, typeFilter]);

  const metrics = useMemo(() => {
    const approved = records.filter((record) => record.approval_status === "approved").length;
    const active = records.filter((record) => record.is_currently_active).length;
    const pending = records.filter((record) => record.approval_status === "pending_review").length;
    const expired = records.filter((record) => record.is_expired || record.approval_status === "expired").length;
    return { total: records.length, approved, active, pending, expired };
  }, [records]);

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await governanceApi.createGovernanceException({
        ...form,
        approval_status: "draft",
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
      });
      setForm(initialForm);
      setTargetSearch("");
      setShowForm(false);
      await loadRecords();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function actionOnRecord(record: GovernanceException, action: "approve" | "reject" | "revoke") {
    try {
      if (action === "approve") {
        await governanceApi.approveGovernanceException(record.id);
      } else if (action === "reject") {
        const note = window.prompt("Justificação da rejeição");
        if (!note) return;
        await governanceApi.rejectGovernanceException(record.id, note);
      } else {
        const note = window.prompt("Motivo para revogar a exceção") || "";
        await governanceApi.revokeGovernanceException(record.id, note);
      }
      await loadRecords();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-indigo-700">Governação operacional</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Exceções e aceitação de risco</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold text-slate-600">
              Regista exceções temporárias a políticas e controlos, aceita riscos com prazo, define controlos compensatórios e mantém a decisão auditável.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadRecords()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setShowForm((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
            >
              <FileWarning className="h-4 w-4" />
              Nova exceção
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={FileWarning} label="Registos" value={metrics.total} tone="text-indigo-600" />
        <SummaryCard icon={CheckCircle2} label="Aprovadas" value={metrics.approved} tone="text-emerald-600" />
        <SummaryCard icon={ShieldAlert} label="Ativas" value={metrics.active} tone="text-sky-600" />
        <SummaryCard icon={Clock} label="Por validar" value={metrics.pending} tone="text-amber-600" />
        <SummaryCard icon={AlertTriangle} label="Expiradas" value={metrics.expired} tone="text-orange-600" />
      </section>

      {showForm && (
        <form onSubmit={submitForm} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Tipo de exceção
              <select
                value={form.exception_type}
                onChange={(event) => setForm((current) => ({ ...current, exception_type: event.target.value as GovernanceExceptionType }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold normal-case text-slate-900"
              >
                {Object.entries(exceptionTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Entidade afetada
              <select
                value={form.target_type}
                onChange={(event) => {
                  setForm((current) => ({ ...current, target_type: event.target.value as GovernanceExceptionTargetType, target_id: "" }));
                  setTargetSearch("");
                }}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold normal-case text-slate-900"
              >
                {Object.entries(targetTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Prazo de validade
              <input
                type="date"
                value={form.valid_until}
                onChange={(event) => setForm((current) => ({ ...current, valid_until: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold normal-case text-slate-900"
                required
              />
            </label>
          </div>

          {searchableTargetTypes.has(form.target_type) ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <label className="space-y-2 text-xs font-black uppercase text-slate-500">
                Pesquisar entidade
                <div className="relative">
                  <input
                    value={targetSearch}
                    onChange={(event) => setTargetSearch(event.target.value)}
                    placeholder="Pesquisar por código, título ou descrição"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case text-slate-900"
                  />
                  {loadingTargets && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-slate-400" />}
                </div>
              </label>
              <label className="space-y-2 text-xs font-black uppercase text-slate-500">
                Seleção
                <select
                  value={form.target_id}
                  onChange={(event) => setForm((current) => ({ ...current, target_id: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold normal-case text-slate-900"
                  required
                >
                  <option value="">Selecionar entidade</option>
                  {targetOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label className="mt-4 block space-y-2 text-xs font-black uppercase text-slate-500">
              ID da entidade
              <input
                value={form.target_id}
                onChange={(event) => setForm((current) => ({ ...current, target_id: event.target.value }))}
                placeholder="ID técnico da entidade"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case text-slate-900"
                required
              />
            </label>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Título
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ex.: MFA em sistema legado aceite temporariamente"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case text-slate-900"
                required
              />
            </label>
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Impacto estimado no score
              <input
                type="number"
                min="-100"
                max="100"
                step="0.01"
                value={form.score_impact}
                onChange={(event) => setForm((current) => ({ ...current, score_impact: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case text-slate-900"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Justificação de negócio
              <textarea
                value={form.business_justification}
                onChange={(event) => setForm((current) => ({ ...current, business_justification: event.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case text-slate-900"
                required
              />
            </label>
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Controlo compensatório
              <textarea
                value={form.compensating_control_description}
                onChange={(event) => setForm((current) => ({ ...current, compensating_control_description: event.target.value }))}
                rows={4}
                placeholder="Ex.: monitorização SIEM reforçada até implementação de MFA"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case text-slate-900"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Impacto em risco
              <textarea
                value={form.risk_impact}
                onChange={(event) => setForm((current) => ({ ...current, risk_impact: event.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case text-slate-900"
              />
            </label>
            <label className="space-y-2 text-xs font-black uppercase text-slate-500">
              Impacto em conformidade
              <textarea
                value={form.compliance_impact}
                onChange={(event) => setForm((current) => ({ ...current, compliance_impact: event.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case text-slate-900"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <input
              value={form.owner}
              onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
              placeholder="Responsável"
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900"
            />
            <input
              value={form.approver}
              onChange={(event) => setForm((current) => ({ ...current, approver: event.target.value }))}
              placeholder="Aprovador previsto"
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900"
            />
            <input
              value={form.evidence_reference}
              onChange={(event) => setForm((current) => ({ ...current, evidence_reference: event.target.value }))}
              placeholder="Evidência ou referência"
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900"
            />
            <input
              value={form.action_reference}
              onChange={(event) => setForm((current) => ({ ...current, action_reference: event.target.value }))}
              placeholder="Ação associada"
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900"
            />
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar rascunho
            </button>
          </div>
        </form>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Registos formais</h2>
            <p className="text-sm font-semibold text-slate-600">Exceções, aceitações temporárias e compensações aprováveis pelo CISO.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as GovernanceExceptionType | "all")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              <option value="all">Todos os tipos</option>
              {Object.entries(exceptionTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as GovernanceExceptionStatus | "all")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              <option value="all">Todos os estados</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            A carregar exceções da base de dados...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-bold text-slate-500">Não existem exceções para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRecords.map((record) => (
              <article key={record.id} className="grid gap-4 p-5 xl:grid-cols-[1fr_auto]">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <GovernanceBadge className={statusTone[record.approval_status]}>{statusLabels[record.approval_status]}</GovernanceBadge>
                    <GovernanceBadge className="border-indigo-100 bg-indigo-50 text-indigo-700">{exceptionTypeLabels[record.exception_type]}</GovernanceBadge>
                    {record.is_expired && <GovernanceBadge className="border-orange-200 bg-orange-50 text-orange-700">Prazo expirado</GovernanceBadge>}
                  </div>
                  <h3 className="text-lg font-black text-slate-950">{record.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {targetTypeLabels[record.target_type]}: {record.target_label || record.target_id}
                  </p>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-black uppercase text-slate-400">Validade</div>
                      <div className="font-black text-slate-900">{formatDate(record.valid_until)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-black uppercase text-slate-400">Owner</div>
                      <div className="font-black text-slate-900">{record.owner || "-"}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-black uppercase text-slate-400">Impacto score</div>
                      <div className="font-black text-slate-900">{record.score_impact ?? 0} pp</div>
                    </div>
                  </div>
                  {(record.business_justification || record.compensating_control_description) && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {record.business_justification && (
                        <div className="rounded-xl border border-slate-100 p-3 text-sm font-semibold text-slate-700">
                          <span className="block text-[11px] font-black uppercase text-slate-400">Justificação</span>
                          {record.business_justification}
                        </div>
                      )}
                      {record.compensating_control_description && (
                        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                          <span className="block text-[11px] font-black uppercase text-amber-500">Compensating control</span>
                          {record.compensating_control_description}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-start gap-2 xl:flex-col">
                  {record.approval_status !== "approved" && record.approval_status !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => void actionOnRecord(record, "approve")}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase text-emerald-700"
                    >
                      Aprovar
                    </button>
                  )}
                  {record.approval_status !== "rejected" && record.approval_status !== "revoked" && (
                    <button
                      type="button"
                      onClick={() => void actionOnRecord(record, "reject")}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-black uppercase text-red-700"
                    >
                      Rejeitar
                    </button>
                  )}
                  {record.approval_status === "approved" && (
                    <button
                      type="button"
                      onClick={() => void actionOnRecord(record, "revoke")}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase text-slate-700"
                    >
                      <XCircle className="h-4 w-4" />
                      Revogar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
