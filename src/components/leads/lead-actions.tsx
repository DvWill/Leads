"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Clipboard, ExternalLink, Loader2, MapPinned, MessageCircle, Phone, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { buildLeadWhatsAppMessage, type WhatsAppFilterContext, type WhatsAppLeadContext } from "@/src/lib/whatsapp-message";

type Props = {
  leadId: string;
  phone: string | null;
  mapsUrl?: string | null;
  compact?: boolean;
  blocked?: boolean;
  lead?: WhatsAppLeadContext;
  filters?: WhatsAppFilterContext;
};

export function LeadActions({ leadId, phone, mapsUrl, compact = false, blocked = false, lead, filters }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [sent, setSent] = useState(true);
  const [returnStatus, setReturnStatus] = useState<"YES" | "NO" | "WAITING">("WAITING");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const digits = phone?.replace(/\D/g, "") ?? "";
  const whatsappMessage = lead ? buildLeadWhatsAppMessage(lead, filters) : "";

  async function copy() {
    if (!phone) return;
    await navigator.clipboard.writeText(phone);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  async function copyMessage() {
    if (!whatsappMessage) return;
    await navigator.clipboard.writeText(whatsappMessage);
    setMessageCopied(true);
    window.setTimeout(() => setMessageCopied(false), 1_500);
  }

  function openWhatsApp() {
    if (!digits || blocked) return;
    const url = new URL(`https://wa.me/${digits}`);
    if (whatsappMessage) url.searchParams.set("text", whatsappMessage);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
    setModal(true);
  }

  async function confirm() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: sent ? "CONTACT_ATTEMPT" : "NOTE",
          channel: sent ? "WHATSAPP" : undefined,
          direction: sent ? "OUTBOUND" : undefined,
          outcome: sent ? (returnStatus === "YES" ? "REPLIED" : "SENT") : undefined,
          returnStatus: sent ? returnStatus : undefined,
          occurredAt: new Date().toISOString(),
          notes: notes || (sent ? "Mensagem enviada pelo WhatsApp." : "WhatsApp aberto; envio não confirmado."),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível registrar.");
      setModal(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar.");
    } finally {
      setLoading(false);
    }
  }

  const linkClass = "focus-ring grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <>
      <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
        <button className={linkClass} onClick={copy} disabled={!phone} aria-label="Copiar telefone">{copied ? <Check className="size-4 text-emerald-600" /> : <Clipboard className="size-4" />}</button>
        <a className={`${linkClass} ${!phone || blocked ? "pointer-events-none opacity-40" : ""}`} href={phone && !blocked ? `tel:${phone}` : undefined} aria-label="Ligar"><Phone className="size-4" /></a>
        <button className={linkClass} onClick={openWhatsApp} disabled={!phone || blocked} aria-label="Abrir WhatsApp"><MessageCircle className="size-4" /></button>
        {mapsUrl ? <a className={linkClass} href={mapsUrl} target="_blank" rel="noreferrer" aria-label="Abrir Google Maps"><MapPinned className="size-4" /></a> : null}
        {!compact ? <a className={linkClass} href={`/leads/${leadId}`} aria-label="Abrir ficha"><ExternalLink className="size-4" /></a> : null}
      </div>

      {modal ? createPortal(
        <div className="fixed inset-0 z-[1000] grid place-items-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="whatsapp-title">
          <div className="card my-6 max-h-[calc(100vh-3rem)] w-full max-w-xl overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 id="whatsapp-title" className="text-lg font-bold text-slate-950">Confirmar ação no WhatsApp</h2><p className="mt-1 text-sm text-slate-500">Abrir a conversa não registra contato automaticamente.</p></div><button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setModal(false)} aria-label="Fechar"><X className="size-5" /></button></div>
            {whatsappMessage ? <div className="mt-5 rounded-xl border border-brand-500/30 bg-brand-50/80 p-3"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[.14em] text-brand-700">Mensagem sugerida</p><button type="button" onClick={copyMessage} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"><Clipboard className="size-3.5" />{messageCopied ? "Copiada" : "Copiar"}</button></div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{whatsappMessage}</p></div> : null}
            <div className="mt-5 rounded-xl bg-slate-50 p-1">
              <div className="grid grid-cols-2 gap-1">
                <button className={`rounded-lg px-3 py-2 text-sm font-semibold ${sent ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"}`} onClick={() => setSent(true)}>Enviei a mensagem</button>
                <button className={`rounded-lg px-3 py-2 text-sm font-semibold ${!sent ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"}`} onClick={() => setSent(false)}>Não enviei</button>
              </div>
            </div>
            {sent ? <fieldset className="mt-5"><legend className="label">Houve retorno?</legend><div className="grid grid-cols-3 gap-2">{([['YES','Sim'],['NO','Não'],['WAITING','Aguardando']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setReturnStatus(value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${returnStatus === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}>{label}</button>)}</div></fieldset> : null}
            <div className="mt-5"><label className="label" htmlFor="whatsapp-note">Observação</label><textarea id="whatsapp-note" className="field min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contexto ou resultado da abordagem" /></div>
            {error ? <p className="mt-3 text-sm text-rose-600" role="alert">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button><Button onClick={confirm} disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Registrar</Button></div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
