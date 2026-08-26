"use client";

import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import { formatDate } from "@/src/lib/utils";

type Preview = {
  inspection: {
    headers: string[];
    totalRows: number;
    delimiter: string;
    encoding: string;
    warnings: string[];
  };
  mapping: Record<string, string | null | undefined>;
  mappingIssues: Array<{ severity: string; message: string }>;
  rows: Array<{
    rowNumber: number;
    values: Record<string, string | null>;
    validation: { success: boolean; issues: Array<{ severity: string; message: string }> };
  }>;
};

type ImportResult = {
  jobId: string;
  summary: {
    totalRows: number;
    newLeads: number;
    updatedLeads: number;
    duplicatesIgnored: number;
    errorRows: number;
    assignedLeads: number;
    unassignedLeads: number;
  };
};

type User = { id: string; name: string };
type Job = {
  id: string;
  filename: string;
  status: string;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  createdAt: string;
  createdBy: string;
};

const fieldOptions = [
  ["", "Não mapear"],
  ["title", "Nome da empresa *"],
  ["phone", "Telefone formatado"],
  ["phoneUnformatted", "Telefone normalizado"],
  ["categoryName", "Categoria principal"],
  ["categories", "Categorias"],
  ["address", "Endereço completo"],
  ["street", "Rua"],
  ["neighborhood", "Bairro"],
  ["city", "Cidade"],
  ["state", "Estado"],
  ["postalCode", "CEP"],
  ["countryCode", "País"],
  ["url", "Link do Google Maps"],
  ["placeId", "Place ID"],
  ["cid", "CID"],
  ["businessProfileId", "Business Profile ID"],
  ["totalScore", "Nota"],
  ["reviewsCount", "Quantidade de avaliações"],
  ["searchString", "Busca de origem"],
  ["scrapedAt", "Data da coleta"],
  ["temporarilyClosed", "Fechada temporariamente"],
  ["permanentlyClosed", "Fechada permanentemente"],
  ["description", "Descrição"],
  ["imageUrl", "Imagem"],
  ["latitude", "Latitude"],
  ["longitude", "Longitude"],
] as const;

const jobLabels: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSING: "Processando",
  COMPLETED: "Concluída",
  COMPLETED_WITH_ERRORS: "Concluída com erros",
  FAILED: "Falhou",
};

export function ImportPage({ users, jobs }: { users: User[]; jobs: Job[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null | undefined>>({});
  const [strategy, setStrategy] = useState("skip");
  const [assignmentMode, setAssignmentMode] = useState<"unassigned" | "specific" | "round-robin">("unassigned");
  const [specificUser, setSpecificUser] = useState("");
  const [roundRobinUsers, setRoundRobinUsers] = useState<string[]>(users.map((user) => user.id));
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);
  const titleMapped = Object.values(mapping).includes("title");

  function setSelectedFile(selected: File | null) {
    if (selected && !/\.(csv|json)$/i.test(selected.name)) {
      setNotice({ error: true, text: "Use um arquivo .csv ou .json." });
      return;
    }
    setFile(selected);
    setPreview(null);
    setMapping({});
    setResult(null);
    setNotice(null);
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    setSelectedFile(event.dataTransfer.files[0] ?? null);
  }

  function assignment() {
    if (assignmentMode === "specific") {
      return { mode: "specific", userId: specificUser, excludeWithoutPhone: true, excludeClosed: true };
    }
    if (assignmentMode === "round-robin") {
      return { mode: "round-robin", userIds: roundRobinUsers, excludeWithoutPhone: true, excludeClosed: true };
    }
    return { mode: "unassigned" };
  }

  async function submit(action: "preview" | "execute") {
    if (!file) return;
    if (action === "execute" && !titleMapped) {
      setNotice({ error: true, text: "Mapeie uma coluna para Nome da empresa antes de importar." });
      return;
    }
    if (action === "execute" && assignmentMode === "specific" && !specificUser) {
      setNotice({ error: true, text: "Selecione o colaborador responsável." });
      return;
    }
    if (action === "execute" && assignmentMode === "round-robin" && !roundRobinUsers.length) {
      setNotice({ error: true, text: "Selecione ao menos um colaborador para o round-robin." });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("action", action);
      form.set("file", file);
      if (preview) form.set("mapping", JSON.stringify(mapping));
      if (action === "execute") {
        form.set("duplicateStrategy", strategy);
        form.set("assignment", JSON.stringify(assignment()));
      }
      const response = await fetch("/api/importacoes", { method: "POST", body: form });
      const payload = (await response.json()) as Preview & ImportResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível processar o arquivo.");
      if (action === "preview") {
        setPreview(payload);
        setMapping(payload.mapping);
      } else {
        setResult(payload);
        router.refresh();
        setNotice({ error: false, text: "Importação concluída. Os dados já estão disponíveis na carteira." });
      }
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Não foi possível processar o arquivo." });
    } finally {
      setBusy(false);
    }
  }

  const valid = preview?.rows.filter((row) => row.validation.success).length ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand-600">Base de leads</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Importar leads por CSV</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Envie CSV (vírgula ou ponto e vírgula, UTF-8/BOM) ou JSON do Google Places. Revise o mapeamento antes de confirmar.
        </p>
      </header>

      <section className="card p-5 sm:p-7">
        <label
          className={`group flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 text-center transition ${dragging ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40"}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <input className="sr-only" type="file" accept=".csv,.json,text/csv,application/json" onChange={choose} />
          <FileSpreadsheet className={`size-10 ${file ? "text-brand-600" : "text-slate-400"}`} />
          <span className="mt-3 font-semibold text-slate-800">{file ? file.name : "Arraste o arquivo ou clique para selecionar"}</span>
          <span className="mt-1 text-sm text-slate-500">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · pronto para analisar` : "CSV ou JSON, até 10 MB"}</span>
        </label>
        <div className="mt-4 flex justify-end">
          <button className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50" type="button" disabled={!file || busy} onClick={() => submit("preview")}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {busy ? "Analisando…" : "Analisar arquivo"}
          </button>
        </div>
      </section>

      {notice ? (
        <div role="alert" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${notice.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.error ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}{notice.text}
        </div>
      ) : null}

      {preview ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5"><p className="text-xs font-semibold uppercase text-slate-400">Registros</p><p className="mt-2 text-3xl font-bold text-slate-950">{preview.inspection.totalRows.toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-slate-400">{preview.inspection.encoding} · delimitador {preview.inspection.delimiter === ";" ? "ponto e vírgula" : "vírgula"}</p></div>
            <div className="card p-5"><p className="text-xs font-semibold uppercase text-slate-400">Válidos na prévia</p><p className="mt-2 text-3xl font-bold text-emerald-600">{valid}</p></div>
            <div className="card p-5"><p className="text-xs font-semibold uppercase text-slate-400">Com erro na prévia</p><p className="mt-2 text-3xl font-bold text-rose-600">{preview.rows.length - valid}</p></div>
          </section>

          {preview.inspection.warnings.length || preview.mappingIssues.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4" />Atenção na prévia</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">{[...preview.inspection.warnings, ...preview.mappingIssues.map((issue) => issue.message)].map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}

          <section className="card p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Mapeamento das colunas</h2><p className="text-sm text-slate-500">A detecção é automática, mas você pode corrigir qualquer campo.</p></div><span className="text-sm font-semibold text-brand-700">{mappedCount} mapeados</span></div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {preview.inspection.headers.map((header) => (
                <label key={header} className="grid items-center gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
                  <span className="truncate text-sm text-slate-600" title={header}>{header}</span>
                  <select className="field py-2" value={mapping[header] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value || null }))}>
                    {fieldOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b px-5 py-4 sm:px-7"><h2 className="text-lg font-bold text-slate-950">Prévia das linhas</h2><p className="text-sm text-slate-500">Erros de uma linha não interrompem as demais.</p></div>
            <div className="overflow-x-auto"><table className="min-w-full divide-y text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left">Linha</th><th className="px-4 py-3 text-left">Empresa</th><th className="px-4 py-3 text-left">Telefone</th><th className="px-4 py-3 text-left">Cidade</th><th className="px-4 py-3 text-left">Validação</th></tr></thead><tbody className="divide-y">{preview.rows.map((row) => { const sourceFor = (field: string) => Object.entries(mapping).find(([, target]) => target === field)?.[0]; return <tr key={row.rowNumber}><td className="px-4 py-3 tabular-nums">{row.rowNumber}</td><td className="px-4 py-3 font-medium">{row.values[sourceFor("title") ?? ""] ?? "—"}</td><td className="px-4 py-3">{row.values[sourceFor("phoneUnformatted") ?? sourceFor("phone") ?? ""] ?? "—"}</td><td className="px-4 py-3">{row.values[sourceFor("city") ?? ""] ?? "—"}</td><td className="px-4 py-3">{row.validation.success ? <span className="text-emerald-700">Válida</span> : <span className="text-rose-700">{row.validation.issues.map((issue) => issue.message).join("; ")}</span>}</td></tr>; })}</tbody></table></div>
          </section>

          <section className="card p-5 sm:p-7">
            <h2 className="text-lg font-bold text-slate-950">Confirmar importação</h2>
            <p className="mt-1 text-sm text-slate-500">A reimportação nunca altera etapa, responsável, contatos, observações ou histórico comercial.</p>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">Duplicatas<select className="field mt-2" value={strategy} onChange={(event) => setStrategy(event.target.value)}><option value="skip">Ignorar duplicatas</option><option value="fill-empty">Preencher somente campos vazios</option><option value="refresh-source">Atualizar dados de origem</option></select></label>
              <label className="text-sm font-semibold text-slate-700">Atribuição<select className="field mt-2" value={assignmentMode} onChange={(event) => setAssignmentMode(event.target.value as typeof assignmentMode)}><option value="unassigned">Deixar sem responsável</option><option value="specific">Escolher um colaborador</option><option value="round-robin">Distribuir igualmente (round-robin)</option></select></label>
            </div>
            {assignmentMode === "specific" ? <label className="mt-4 block"><span className="label">Colaborador</span><select className="field" value={specificUser} onChange={(event) => setSpecificUser(event.target.value)}><option value="">Selecione…</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label> : null}
            {assignmentMode === "round-robin" ? <fieldset className="mt-4"><legend className="label">Colaboradores ativos</legend><div className="flex flex-wrap gap-3">{users.map((user) => <label key={user.id} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={roundRobinUsers.includes(user.id)} onChange={(event) => setRoundRobinUsers((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} />{user.name}</label>)}</div><p className="mt-2 text-xs text-slate-500">Leads sem telefone ou empresas fechadas ficam fora da distribuição por padrão.</p></fieldset> : null}
            <div className="mt-6 flex justify-end"><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" type="button" disabled={busy || !titleMapped} onClick={() => submit("execute")}>{busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}Importar {preview.inspection.totalRows.toLocaleString("pt-BR")} leads</button></div>
          </section>
        </>
      ) : null}

      {result ? <section className="card border-emerald-200 bg-emerald-50/40 p-5"><h2 className="font-bold text-emerald-900">Resumo da importação</h2><div className="mt-3 grid gap-2 text-sm text-emerald-800 sm:grid-cols-2 lg:grid-cols-3"><span>Novos: <strong>{result.summary.newLeads}</strong></span><span>Atualizados: <strong>{result.summary.updatedLeads}</strong></span><span>Duplicatas ignoradas: <strong>{result.summary.duplicatesIgnored}</strong></span><span>Erros: <strong>{result.summary.errorRows}</strong></span><span>Atribuídos: <strong>{result.summary.assignedLeads}</strong></span><span>Sem responsável: <strong>{result.summary.unassignedLeads}</strong></span></div></section> : null}

      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-5 py-4 sm:px-7"><Users className="size-5 text-brand-600" /><div><h2 className="font-semibold text-slate-950">Histórico de importações</h2><p className="text-xs text-slate-500">Auditoria dos últimos arquivos processados.</p></div></div>
        {jobs.length ? <div className="overflow-x-auto"><table className="min-w-full divide-y text-sm"><thead className="bg-slate-50"><tr>{["Arquivo", "Responsável", "Data", "Status", "Novos", "Atualizados", "Erros"].map((title) => <th key={title} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{title}</th>)}</tr></thead><tbody className="divide-y">{jobs.map((job) => <tr key={job.id}><td className="px-4 py-3 font-medium text-slate-800">{job.filename}</td><td className="px-4 py-3 text-slate-600">{job.createdBy}</td><td className="px-4 py-3 text-slate-500">{formatDate(job.createdAt, true)}</td><td className="px-4 py-3 text-slate-600">{jobLabels[job.status] ?? job.status}</td><td className="px-4 py-3 tabular-nums">{job.createdRows}</td><td className="px-4 py-3 tabular-nums">{job.updatedRows}</td><td className="px-4 py-3 tabular-nums text-rose-600">{job.errorRows}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-slate-500">Nenhuma importação realizada ainda.</p>}
      </section>
    </div>
  );
}
