"use client";

import { useState, type ChangeEvent } from "react";
import { CheckCircle2, FileJson, Loader2, RefreshCw, UploadCloud, XCircle } from "lucide-react";

type Preview = {
  inspection: { headers: string[]; totalRows: number; delimiter: string; encoding: string; warnings: string[] };
  mapping: Record<string, string | null | undefined>;
  mappingIssues: Array<{ severity: string; message: string }>;
  rows: Array<{ rowNumber: number; validation: { success: boolean; issues: Array<{ severity: string; message: string }> } }>;
};
type ImportResult = { summary: { totalRows: number; newLeads: number; updatedLeads: number; duplicatesIgnored: number; errorRows: number; unassignedLeads: number } };
const labels: Record<string, string> = { title: "Nome", phone: "Telefone", phoneUnformatted: "Telefone sem formatação", categoryName: "Categoria", categories: "Categorias", address: "Endereço", neighborhood: "Bairro", street: "Rua", city: "Cidade", state: "Estado", postalCode: "CEP", countryCode: "País", url: "Link Google Maps", placeId: "Place ID", cid: "CID", businessProfileId: "Perfil comercial", totalScore: "Nota", reviewsCount: "Avaliações", scrapedAt: "Coletado em", temporarilyClosed: "Fechada temporariamente", permanentlyClosed: "Fechada permanentemente", imageUrl: "Imagem", latitude: "Latitude", longitude: "Longitude" };

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [strategy, setStrategy] = useState("skip");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function choose(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] ?? null); setPreview(null); setResult(null); setNotice(null); }
  async function submit(action: "preview" | "execute") {
    if (!file) return;
    setBusy(true); setNotice(null);
    try {
      const form = new FormData(); form.set("action", action); form.set("file", file);
      if (preview) form.set("mapping", JSON.stringify(preview.mapping));
      if (action === "execute") { form.set("duplicateStrategy", strategy); form.set("assignment", JSON.stringify({ mode: "unassigned" })); }
      const response = await fetch("/api/importacoes", { method: "POST", body: form });
      const payload = await response.json() as Preview & ImportResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível processar o JSON.");
      if (action === "preview") setPreview(payload); else { setResult(payload); setNotice({ error: false, text: "Importação concluída. Os leads já estão disponíveis na carteira." }); }
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Não foi possível processar o JSON." }); }
    finally { setBusy(false); }
  }
  const mapped = preview ? Object.entries(preview.mapping).filter(([, field]) => field) : [];
  const valid = preview?.rows.filter((row) => row.validation.success).length ?? 0;

  return <div className="space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand-600">Base de leads</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Importar JSON</h1><p className="mt-2 text-sm text-slate-500">Use o arquivo JSON exportado pelo Google Places. O sistema reconhece automaticamente nome, telefone, endereço, categoria, Place ID e coordenadas.</p></header>
    <section className="card p-5 sm:p-7"><label className="group flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 text-center hover:border-brand-400 hover:bg-brand-50/40"><input className="sr-only" type="file" accept=".json,application/json" onChange={choose} /><FileJson className={`size-10 ${file ? "text-brand-600" : "text-slate-400"}`} /><span className="mt-3 font-semibold text-slate-800">{file ? file.name : "Selecione o arquivo JSON"}</span><span className="mt-1 text-sm text-slate-500">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · pronto para analisar` : "Array de estabelecimentos do Google Places"}</span></label><div className="mt-4 flex justify-end"><button className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50" type="button" disabled={!file || busy} onClick={() => submit("preview")}><RefreshCw className="size-4" />{busy ? "Analisando..." : "Analisar arquivo"}</button></div></section>
    {notice ? <div role="alert" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${notice.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.error ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}{notice.text}</div> : null}
    {preview ? <><section className="grid gap-4 sm:grid-cols-3"><div className="card p-5"><p className="text-xs font-semibold uppercase text-slate-400">Estabelecimentos</p><p className="mt-2 text-3xl font-bold text-slate-950">{preview.inspection.totalRows.toLocaleString("pt-BR")}</p></div><div className="card p-5"><p className="text-xs font-semibold uppercase text-slate-400">Válidos na prévia</p><p className="mt-2 text-3xl font-bold text-emerald-600">{valid}</p></div><div className="card p-5"><p className="text-xs font-semibold uppercase text-slate-400">Com erro na prévia</p><p className="mt-2 text-3xl font-bold text-rose-600">{preview.rows.length - valid}</p></div></section><section className="card p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Campos reconhecidos</h2><p className="text-sm text-slate-500">Campos extras permanecem guardados nos dados de origem do lead.</p></div><span className="text-sm font-semibold text-brand-700">{mapped.length} campos</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{mapped.slice(0, 24).map(([header, field]) => <div key={header} className="flex min-w-0 justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="truncate text-slate-500" title={header}>{header}</span><span className="shrink-0 font-semibold text-slate-800">{labels[field ?? ""] ?? field}</span></div>)}</div></section><section className="card p-5 sm:p-7"><h2 className="text-lg font-bold text-slate-950">Confirmar importação</h2><p className="mt-1 text-sm text-slate-500">Duplicatas são identificadas primeiro pelo Place ID, depois pelo telefone e nome com endereço.</p><div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><label className="text-sm font-semibold text-slate-700">Duplicatas<select className="field mt-2 min-w-64" value={strategy} onChange={(event) => setStrategy(event.target.value)}><option value="skip">Ignorar duplicatas</option><option value="fill-empty">Preencher campos vazios</option><option value="refresh-source">Atualizar dados de origem</option></select></label><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" type="button" disabled={busy} onClick={() => submit("execute")}>{busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}Importar leads</button></div></section></> : null}
    {result ? <section className="card border-emerald-200 bg-emerald-50/40 p-5"><h2 className="font-bold text-emerald-900">Resumo da importação</h2><div className="mt-3 grid gap-2 text-sm text-emerald-800 sm:grid-cols-2 lg:grid-cols-3"><span>Novos: <strong>{result.summary.newLeads}</strong></span><span>Atualizados: <strong>{result.summary.updatedLeads}</strong></span><span>Duplicatas ignoradas: <strong>{result.summary.duplicatesIgnored}</strong></span><span>Erros: <strong>{result.summary.errorRows}</strong></span></div></section> : null}
  </div>;
}
