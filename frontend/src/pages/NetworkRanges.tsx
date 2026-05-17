import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Activity, CheckCircle2, Network, Plus, RefreshCw, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { riskApi, type NetworkRange } from "@/lib/riskApi";

const emptyForm = {
  name: "",
  cidr: "",
  description: "",
};

export default function NetworkRanges() {
  const [ranges, setRanges] = useState<NetworkRange[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listNetworkRanges({ search });
      setRanges(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar as redes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => ({
    total: ranges.length,
    active: ranges.filter((range) => range.is_active !== false).length,
    inactive: ranges.filter((range) => range.is_active === false).length,
  }), [ranges]);

  const createRange = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.cidr.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await riskApi.createNetworkRange({
        name: form.name.trim(),
        cidr: form.cidr.trim(),
        description: form.description.trim(),
        is_active: true,
      });
      setForm(emptyForm);
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel criar a rede.");
    } finally {
      setSaving(false);
    }
  };

  const toggleRange = async (range: NetworkRange) => {
    setError(null);
    try {
      await riskApi.updateNetworkRange(range.id, { is_active: range.is_active === false });
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel atualizar a rede.");
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Superficie de rede</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Redes monitorizadas</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Intervalos CIDR usados por descoberta, inventario e correlacao de ativos expostos.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Network className="h-5 w-5 text-emerald-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Redes</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.active}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ativas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Activity className="h-5 w-5 text-slate-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.inactive}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pausadas</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
        <form onSubmit={createRange} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Nova rede</h2>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">CIDR para descoberta</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                placeholder="Ex.: Rede corporativa"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">CIDR</span>
              <input
                value={form.cidr}
                onChange={(event) => setForm((current) => ({ ...current, cidr: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                placeholder="192.168.1.0/24"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Descricao</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                placeholder="Ambito, finalidade ou notas de descoberta"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving || !form.name.trim() || !form.cidr.trim()}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Plus className="h-4 w-4" />
            {saving ? "A guardar..." : "Adicionar rede"}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") load();
                }}
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                placeholder="Pesquisar rede ou CIDR"
              />
            </div>
            <button
              onClick={load}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-emerald-700"
            >
              <Search className="h-4 w-4" />
              Filtrar
            </button>
          </div>

          {error && <div className="m-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-10 text-center text-sm font-bold text-slate-400">A carregar redes...</div>
            ) : ranges.length === 0 ? (
              <div className="p-10 text-center text-sm font-bold text-slate-400">Sem redes configuradas.</div>
            ) : (
              ranges.map((range) => (
                <div key={range.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_.9fr_auto] lg:items-center">
                  <div>
                    <p className="text-base font-bold text-slate-950">{range.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{range.description || "Sem descricao"}</p>
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-700">{range.cidr}</div>
                  <button
                    onClick={() => toggleRange(range)}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-wide ${
                      range.is_active === false
                        ? "border-slate-200 bg-slate-50 text-slate-500 hover:text-emerald-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {range.is_active === false ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
                    {range.is_active === false ? "Pausada" : "Ativa"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
