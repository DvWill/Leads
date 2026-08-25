"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Loader2, MessageSquarePlus, Shuffle, Target, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type Stage = { id: string; name: string; color: string; requiresMeetingAt: boolean; requiresProposalAt: boolean; requiresLossReason: boolean; blocksContact: boolean; isWon: boolean };
type Reason = { id: string; name: string };
type User = { id: string; name: string };

async function requestJson(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível concluir a ação.");
}

function nowLocal() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function LeadWorkspace({ leadId, stages, currentStageId, reasons, users, assigneeId, blocked }: { leadId: string; stages: Stage[]; currentStageId: string; reasons: Reason[]; users: User[]; assigneeId: string | null; blocked: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"contact" | "stage" | "task" | "assign">("contact");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [returnStatus, setReturnStatus] = useState<"YES" | "NO" | "WAITING">("WAITING");
  const [stageId, setStageId] = useState(currentStageId);
  const selectedStage = useMemo(() => stages.find((stage) => stage.id === stageId), [stageId, stages]);

  async function submit(event: FormEvent<HTMLFormElement>, url: string, method: string, transform: (form: FormData) => unknown) {
    event.preventDefault(); setLoading(true); setMessage(null);
    try {
      const form = new FormData(event.currentTarget);
      await requestJson(url, method, transform(form));
      setMessage({ tone: "ok", text: "Alteração salva e adicionada ao histórico." });
      if (tab === "contact" || tab === "task") event.currentTarget.reset();
      router.refresh();
    } catch (cause) { setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível salvar." }); }
    finally { setLoading(false); }
  }

  const tabs = [
    { id: "contact" as const, label: "Registrar contato", icon: MessageSquarePlus },
    { id: "stage" as const, label: "Mover etapa", icon: Target },
    { id: "task" as const, label: "Agendar ação", icon: CalendarPlus },
    ...(users.length ? [{ id: "assign" as const, label: "Reatribuir", icon: Shuffle }] : []),
  ];

  return (
    <section className="card overflow-hidden">
      <div className="flex gap-1 overflow-x-auto border-b bg-slate-50/60 p-2" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setMessage(null); }} className={`focus-ring flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${tab === id ? "bg-white text-brand-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}><Icon className="size-4" />{label}</button>)}
      </div>
      <div className="p-5 sm:p-6">
        {blocked && tab === "contact" ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><strong>Abordagens bloqueadas.</strong> Um administrador precisa liberar este lead antes de um novo contato.</div> : null}

        {tab === "contact" ? <form onSubmit={(event) => submit(event, `/api/leads/${leadId}/activities`, "POST", (form) => ({ type: form.get("direction") === "INBOUND" ? "CONTACT_RESPONSE" : "CONTACT_ATTEMPT", channel: form.get("channel"), direction: form.get("direction"), outcome: form.get("outcome"), returnStatus, notes: form.get("notes") || undefined, occurredAt: new Date(String(form.get("occurredAt"))).toISOString(), durationSeconds: form.get("duration") ? Number(form.get("duration")) * 60 : undefined, nextActionAt: form.get("nextActionAt") ? new Date(String(form.get("nextActionAt"))).toISOString() : undefined, nextActionTitle: form.get("nextActionTitle") || undefined }))}>
          <fieldset disabled={blocked || loading} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label><span className="label">Data e hora</span><input className="field" name="occurredAt" type="datetime-local" defaultValue={nowLocal()} required /></label><label><span className="label">Canal</span><select className="field" name="channel" defaultValue="WHATSAPP" required><option value="WHATSAPP">WhatsApp</option><option value="PHONE">Ligação</option><option value="EMAIL">E-mail</option><option value="INSTAGRAM">Instagram</option><option value="OTHER">Outro</option></select></label><label><span className="label">Direção</span><select className="field" name="direction" defaultValue="OUTBOUND" required><option value="OUTBOUND">Enviado / realizado</option><option value="INBOUND">Recebido</option></select></label><label><span className="label">Resultado</span><select className="field" name="outcome" defaultValue="SENT" required><option value="SENT">Mensagem enviada</option><option value="NO_ANSWER">Não atendeu</option><option value="CONNECTED">Conversa iniciada</option><option value="REPLIED">Respondeu</option><option value="INVALID_CONTACT">Contato inválido</option><option value="INTERESTED">Interessado</option><option value="NOT_INTERESTED">Sem interesse</option><option value="MEETING_BOOKED">Reunião agendada</option><option value="PROPOSAL_SENT">Proposta enviada</option><option value="WON">Venda ganha</option><option value="OTHER">Outro</option></select></label></div>
            <fieldset><legend className="label">Houve retorno?</legend><div className="grid max-w-md grid-cols-3 gap-2">{([['YES','Sim'],['NO','Não'],['WAITING','Aguardando']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setReturnStatus(value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${returnStatus === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}>{label}</button>)}</div></fieldset>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]"><label><span className="label">Observações</span><textarea className="field min-h-24" name="notes" placeholder="Resumo objetivo da conversa, objeções e contexto" /></label><label><span className="label">Duração (min)</span><input className="field" name="duration" type="number" min="0" max="1440" placeholder="Opcional" /></label></div>
            <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Próximo acompanhamento</span><input className="field" name="nextActionAt" type="datetime-local" /></label><label><span className="label">Próxima ação</span><input className="field" name="nextActionTitle" placeholder="Ex.: cobrar retorno da proposta" /></label></div>
            <div className="flex justify-end"><Button type="submit" disabled={blocked || loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Salvar contato</Button></div>
          </fieldset>
        </form> : null}

        {tab === "stage" ? <form onSubmit={(event) => submit(event, `/api/leads/${leadId}/stage`, "PATCH", (form) => ({ stageId, meetingAt: form.get("meetingAt") ? new Date(String(form.get("meetingAt"))).toISOString() : undefined, proposalSentAt: form.get("proposalSentAt") ? new Date(String(form.get("proposalSentAt"))).toISOString() : undefined, proposalValue: form.get("proposalValue") || undefined, wonAt: form.get("wonAt") ? new Date(String(form.get("wonAt"))).toISOString() : undefined, wonValue: form.get("wonValue") || undefined, lossReasonId: form.get("lossReasonId") || undefined, reason: form.get("reason") || undefined }))} className="space-y-4">
          <label><span className="label">Nova etapa</span><select className="field" value={stageId} onChange={(event) => setStageId(event.target.value)}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
          {selectedStage?.requiresMeetingAt ? <label><span className="label">Data e hora da reunião *</span><input className="field" name="meetingAt" type="datetime-local" required /></label> : null}
          {selectedStage?.requiresProposalAt ? <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Envio da proposta *</span><input className="field" name="proposalSentAt" type="datetime-local" required /></label><label><span className="label">Valor da proposta</span><input className="field" name="proposalValue" type="number" min="0" step="0.01" /></label></div> : null}
          {selectedStage?.isWon ? <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Data do fechamento</span><input className="field" name="wonAt" type="datetime-local" defaultValue={nowLocal()} /></label><label><span className="label">Valor da venda</span><input className="field" name="wonValue" type="number" min="0" step="0.01" /></label></div> : null}
          {selectedStage?.requiresLossReason ? <label><span className="label">Motivo da perda *</span><select className="field" name="lossReasonId" required><option value="">Selecione…</option>{reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label> : null}
          <label><span className="label">Motivo ou observação {selectedStage?.blocksContact ? "*" : ""}</span><textarea className="field min-h-20" name="reason" required={selectedStage?.blocksContact} placeholder="Explique o contexto da mudança" /></label>
          <div className="flex justify-end"><Button type="submit" disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}Mover lead</Button></div>
        </form> : null}

        {tab === "task" ? <form onSubmit={(event) => submit(event, `/api/leads/${leadId}/tasks`, "POST", (form) => ({ title: form.get("title"), description: form.get("description") || undefined, dueAt: new Date(String(form.get("dueAt"))).toISOString(), reminderAt: form.get("reminderAt") ? new Date(String(form.get("reminderAt"))).toISOString() : undefined, priority: form.get("priority") }))} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Próxima ação *</span><input className="field" name="title" minLength={2} required placeholder="Ex.: confirmar reunião" /></label><label><span className="label">Vencimento *</span><input className="field" name="dueAt" type="datetime-local" required /></label><label><span className="label">Lembrete interno</span><input className="field" name="reminderAt" type="datetime-local" /></label><label><span className="label">Prioridade</span><select className="field" name="priority" defaultValue="NORMAL"><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></label></div><label><span className="label">Detalhes</span><textarea className="field min-h-20" name="description" /></label><div className="flex justify-end"><Button type="submit" disabled={loading}><CalendarPlus className="size-4" />Agendar</Button></div></form> : null}

        {tab === "assign" ? <form onSubmit={(event) => submit(event, "/api/leads/bulk/assign", "POST", (form) => ({ leadIds: [leadId], assigneeId: form.get("assigneeId") || null, note: form.get("note") || undefined }))} className="space-y-4"><label><span className="label">Responsável</span><select className="field" name="assigneeId" defaultValue={assigneeId ?? ""}><option value="">Sem responsável</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label><span className="label">Motivo da reatribuição</span><textarea className="field min-h-20" name="note" /></label><div className="flex justify-end"><Button type="submit" disabled={loading}><Shuffle className="size-4" />Salvar responsável</Button></div></form> : null}

        {message ? <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`} role="status">{message.tone === "ok" ? <Check className="mt-0.5 size-4 shrink-0" /> : <X className="mt-0.5 size-4 shrink-0" />}{message.text}</div> : null}
      </div>
    </section>
  );
}
