"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Plus, Power } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type User = { id: string; name: string; email: string; role: string; status: string };

async function mutate(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar.");
}

export function CreateUserForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await mutate("/api/admin/users", "POST", { name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role"), maxActiveLeads: form.get("maxActiveLeads") ? Number(form.get("maxActiveLeads")) : null });
      event.currentTarget.reset(); setMessage("Colaborador criado com sucesso."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <details className="card p-5"><summary className="cursor-pointer font-semibold text-slate-900">Adicionar colaborador</summary><form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={submit}><label><span className="label">Nome</span><input className="field" name="name" required minLength={2} /></label><label><span className="label">E-mail</span><input className="field" name="email" type="email" required /></label><label><span className="label">Senha inicial</span><input className="field" name="password" type="password" required minLength={12} /></label><label><span className="label">Papel</span><select className="field" name="role" defaultValue="COLLABORATOR"><option value="COLLABORATOR">Colaborador</option><option value="MANAGER">Gestor</option><option value="ADMIN">Administrador</option></select></label><label><span className="label">Limite de leads</span><input className="field" name="maxActiveLeads" type="number" min="0" placeholder="Sem limite" /></label><div className="flex items-center gap-3 md:col-span-2 xl:col-span-5"><Button type="submit" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Criar acesso</Button>{message ? <span className="text-sm text-slate-600" role="status">{message}</span> : null}</div></form></details>;
}

export function UserAdminActions({ user }: { user: User }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function status() {
    setBusy(true); setMessage("");
    try { await mutate(`/api/admin/users/${user.id}/status`, "PATCH", { status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao alterar status."); }
    finally { setBusy(false); }
  }
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); const form = new FormData(event.currentTarget);
    try { await mutate(`/api/admin/users/${user.id}/password`, "POST", { password: form.get("password"), confirmation: form.get("confirmation") }); event.currentTarget.reset(); setMessage("Senha redefinida; sessões anteriores foram encerradas."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao redefinir senha."); }
    finally { setBusy(false); }
  }
  return <details className="min-w-56"><summary className="cursor-pointer text-xs font-semibold text-brand-700">Gerenciar acesso</summary><div className="mt-2 rounded-xl border bg-white p-3 shadow-lg"><Button className="w-full" variant="secondary" disabled={busy} onClick={status}><Power className="size-4" />{user.status === "ACTIVE" ? "Desativar" : "Ativar"}</Button><form className="mt-3 space-y-2" onSubmit={reset}><input className="field py-1.5 text-xs" name="password" type="password" minLength={12} required placeholder="Nova senha" /><input className="field py-1.5 text-xs" name="confirmation" type="password" minLength={12} required placeholder="Confirmar senha" /><Button className="w-full" type="submit" disabled={busy}><KeyRound className="size-4" />Redefinir senha</Button></form>{message ? <p className="mt-2 text-xs text-slate-600" role="status">{message}</p> : null}</div></details>;
}
