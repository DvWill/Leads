"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StageQuickSelect({ leadId, currentStageId, stages }: { leadId: string; currentStageId: string; stages: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [value, setValue] = useState(currentStageId);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function change(stageId: string) {
    const previous = value;
    setValue(stageId); setLoading(true); setError("");
    try {
      const response = await fetch(`/api/leads/${leadId}/stage`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageId }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível mover.");
      router.refresh();
    } catch (cause) {
      setValue(previous);
      setError(cause instanceof Error ? cause.message : "Não foi possível mover.");
    } finally { setLoading(false); }
  }
  return <div><select className="field max-w-48 py-1.5 text-xs" value={value} onChange={(event) => change(event.target.value)} disabled={loading} aria-label="Alterar etapa">{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>{error ? <a className="mt-1 block text-[11px] text-rose-600" href={`/leads/${leadId}`}>{error} Abrir ficha.</a> : null}</div>;
}
