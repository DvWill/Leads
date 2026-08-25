"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shuffle, UserRoundCheck } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export function BulkAssignToolbar({ leadIds, users }: { leadIds: string[]; users: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [assignee, setAssignee] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>(users.map((user) => user.id));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(url: string, payload: unknown) {
    setLoading(true); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json()) as { error?: string; assigned?: number; excluded?: number };
      if (!response.ok) throw new Error(body.error ?? "Falha na atribuição.");
      setMessage(`${body.assigned ?? 0} lead(s) atribuídos${body.excluded ? `; ${body.excluded} fora dos critérios` : ""}.`);
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Falha na atribuição."); }
    finally { setLoading(false); }
  }
  if (!leadIds.length) return null;
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">Distribuição em massa ({leadIds.length} leads desta visualização)</summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex items-end gap-2"><label className="min-w-0 flex-1"><span className="label">Atribuir todos a</span><select className="field" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Selecione…</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><Button disabled={!assignee || loading} onClick={() => submit("/api/leads/bulk/assign", { leadIds, assigneeId: assignee })}>{loading ? <Loader2 className="size-4 animate-spin" /> : <UserRoundCheck className="size-4" />}Atribuir</Button></div>
        <div><span className="label">Round-robin equilibrado</span><div className="mb-2 flex flex-wrap gap-2">{users.map((user) => <label key={user.id} className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={(event) => setSelectedUsers((list) => event.target.checked ? [...list, user.id] : list.filter((id) => id !== user.id))} />{user.name}</label>)}</div><Button variant="secondary" disabled={!selectedUsers.length || loading} onClick={() => submit("/api/leads/distribute", { leadIds, collaboratorIds: selectedUsers, includeWithoutPhone: false, includeClosed: false })}><Shuffle className="size-4" />Distribuir elegíveis</Button></div>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-600" role="status">{message}</p> : null}
    </details>
  );
}
