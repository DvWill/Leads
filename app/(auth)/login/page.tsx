import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { getCurrentSession } from "@/src/server/auth";
import { LoginForm } from "@/src/components/auth/login-form";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_10%,#1788e5_0,transparent_36%),radial-gradient(circle_at_80%_80%,#6d5ee7_0,transparent_30%)]" />
        <div className="relative flex items-center gap-3 text-lg font-bold">
          <span className="grid size-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15"><Sparkles className="size-5" aria-hidden /></span>
          Prospecta
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-blue-300">Prospecção com clareza</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight xl:text-5xl">Toda oportunidade no lugar certo. Toda conversa registrada.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">Distribua leads, acompanhe o time e tome decisões com um histórico confiável — sem perder velocidade.</p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-slate-300"><ShieldCheck className="size-4 text-emerald-400" aria-hidden /> Dados protegidos por acesso e organização</div>
      </section>

      <section className="flex items-center justify-center bg-slate-50 px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-ink text-white"><Sparkles className="size-5" aria-hidden /></span>
            <span className="text-lg font-bold">Prospecta</span>
          </div>
          <div className="card p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">Bem-vindo de volta</h2>
            <p className="mt-2 text-sm text-slate-500">Entre com seu e-mail corporativo para continuar.</p>
            <LoginForm />
          </div>
          <p className="mt-5 text-center text-xs text-slate-400">O acesso é monitorado e protegido contra tentativas automatizadas.</p>
        </div>
      </section>
    </main>
  );
}
