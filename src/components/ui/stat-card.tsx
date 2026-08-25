import type { LucideIcon } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function StatCard({ label, value, detail, icon: Icon, tone = "blue" }: { label: string; value: string | number; detail?: string; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "purple" | "slate" }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950">{value}</p>
          {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
        </div>
        <span className={cn("rounded-xl p-2.5", colors[tone])}><Icon aria-hidden className="size-5" /></span>
      </div>
    </div>
  );
}
