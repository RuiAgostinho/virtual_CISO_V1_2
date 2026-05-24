import type { ElementType, ReactNode } from "react";
import {
  mappingSourceLabel,
  mappingSourceTone,
  mappingStatusLabel,
  mappingStatusTone,
} from "./governanceMappingLabels";

type BadgeProps = {
  children: ReactNode;
  className?: string;
};

export function GovernanceBadge({ children, className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

type InfoCardProps = {
  icon: ElementType;
  label: string;
  value: ReactNode;
  tone?: string;
  detail?: ReactNode;
  valueClassName?: string;
};

export function GovernanceInfoCard({
  icon: Icon,
  label,
  value,
  tone = "text-indigo-700",
  detail,
  valueClassName = "text-3xl",
}: InfoCardProps) {
  return (
    <div className="min-h-[132px] rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className={`mt-3 font-bold text-slate-950 ${valueClassName}`}>{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      {detail ? <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p> : null}
    </div>
  );
}

type MetricCardProps = InfoCardProps & {
  className?: string;
};

export function GovernanceMetricCard({ className = "", ...props }: MetricCardProps) {
  return (
    <div className={className}>
      <GovernanceInfoCard {...props} />
    </div>
  );
}

type MetricTone = "slate" | "emerald" | "amber" | "red" | "indigo" | "orange" | "violet";

const framedMetricTone: Record<MetricTone, string> = {
  slate: "border-slate-100 bg-slate-50 text-slate-700",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  red: "border-red-100 bg-red-50 text-red-700",
  indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
  orange: "border-orange-100 bg-orange-50 text-orange-700",
  violet: "border-violet-100 bg-violet-50 text-violet-700",
};

type FramedMetricCardProps = {
  icon: ElementType;
  label: string;
  value: ReactNode;
  tone?: MetricTone;
  detail?: ReactNode;
};

export function GovernanceFramedMetricCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
  detail,
}: FramedMetricCardProps) {
  return (
    <div className="min-h-[132px] rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${framedMetricTone[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-950">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      {detail ? <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p> : null}
    </div>
  );
}

type SectionCardProps = {
  title: string;
  icon: ElementType;
  children: ReactNode;
  action?: ReactNode;
};

export function GovernanceSectionCard({ title, icon: Icon, children, action }: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-indigo-700" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

type PanelProps = {
  title: string;
  icon: ElementType;
  children: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  empty?: boolean;
  bodyClassName?: string;
  iconClassName?: string;
  titleClassName?: string;
};

export function GovernancePanel({
  title,
  icon: Icon,
  children,
  subtitle,
  action,
  empty = false,
  bodyClassName = "",
  iconClassName = "text-indigo-600",
  titleClassName = "text-xl font-black text-slate-950",
}: PanelProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/40 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 ${iconClassName}`} />
            <h2 className={titleClassName}>{title}</h2>
          </div>
          {subtitle ? <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p> : null}
        </div>
        {action || (empty ? <span className="shrink-0 text-xs font-black uppercase tracking-wide text-emerald-600">OK</span> : null)}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

type EmptyStateProps = {
  text?: string;
  children?: ReactNode;
};

export function GovernanceEmptyState({ text, children }: EmptyStateProps) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
      {children || text}
    </div>
  );
}

export function GovernanceProgressBar({ value, tone = "bg-indigo-600" }: { value: unknown; tone?: string }) {
  const numericValue = Number(value);
  const percentage = Math.max(0, Math.min(100, Number.isFinite(numericValue) ? numericValue : 0));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${percentage}%` }} />
    </div>
  );
}

export function GovernanceStatusPill({
  children,
  tone = "bg-slate-100 text-slate-600",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${tone}`}>
      {children}
    </span>
  );
}

export function GovernanceKeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

export function MappingStatusBadge({ status }: { status?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-bold ${mappingStatusTone(status)}`}>
      {mappingStatusLabel(status)}
    </span>
  );
}

export function MappingSourceBadge({ source }: { source?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-bold ${mappingSourceTone(source)}`}>
      {mappingSourceLabel(source)}
    </span>
  );
}
