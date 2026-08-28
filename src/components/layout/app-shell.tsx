"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  FileClock,
  Import,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { cn, initials } from "@/src/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  user: { name: string; email: string; role: string };
  organization: { name: string };
  canAdmin: boolean;
  canImport: boolean;
};

const mainLinks = [
  { href: "/dashboard", label: "Resumo", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: BriefcaseBusiness },
  { href: "/tarefas", label: "Agenda e tarefas", icon: ClipboardCheck },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

export function AppShell({ children, user, organization, canAdmin, canImport }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const adminLinks = [
    { href: "/equipe", label: "Equipe", icon: Users, show: canAdmin },
    { href: "/importacoes", label: "Importações", icon: Import, show: canImport },
    { href: "/auditoria", label: "Auditoria", icon: FileClock, show: canAdmin },
    { href: "/configuracoes", label: "Configurações", icon: Settings, show: canAdmin },
  ].filter((item) => item.show);

  function NavLink({ href, label, icon: Icon }: (typeof mainLinks)[number]) {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link href={href} onClick={() => setOpen(false)} className={cn("focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")} aria-current={active ? "page" : undefined}>
        <Icon className="size-[18px] shrink-0" aria-hidden />{label}
      </Link>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <span className="grid size-9 place-items-center rounded-xl bg-ink text-white"><Sparkles className="size-[18px]" aria-hidden /></span>
        <div className="min-w-0"><p className="font-bold leading-5 text-slate-950">Prospecta</p><p className="truncate text-xs text-slate-400">{organization.name}</p></div>
        <button className="ml-auto rounded-lg p-1.5 text-slate-500 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="size-5" /></button>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto p-3" aria-label="Navegação principal">
        <div className="space-y-1">{mainLinks.map((link) => <NavLink key={link.href} {...link} />)}</div>
        {adminLinks.length ? (
          <div><p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[.15em] text-slate-400">Administração</p><div className="space-y-1">{adminLinks.map((link) => <NavLink key={link.href} {...link} />)}</div></div>
        ) : null}
      </nav>
      <div className="border-t p-3">
        <button onClick={() => setProfileOpen((value) => !value)} className="focus-ring flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50" aria-expanded={profileOpen}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials(user.name)}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{user.name}</span><span className="block truncate text-xs text-slate-400">{user.email}</span></span>
          <ChevronDown className={cn("size-4 text-slate-400 transition", profileOpen && "rotate-180")} aria-hidden />
        </button>
        {profileOpen ? (
          <form action="/api/auth/logout" method="post" className="mt-1"><button className="focus-ring w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50" type="submit">Sair da conta</button></form>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r lg:block">{sidebar}</aside>
      {open ? <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" aria-label="Fechar menu" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 w-[min(19rem,88vw)] shadow-2xl">{sidebar}</aside></div> : null}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-violet-300/20 bg-slate-950/95 px-4 shadow-[0_8px_28px_rgba(4,2,12,.28)] backdrop-blur-xl lg:hidden">
        <button className="focus-ring grid size-10 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-500/10 text-violet-200 transition hover:bg-violet-500/20 active:scale-95" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu className="size-5" /></button>
        <Link href="/dashboard" className="focus-ring flex min-w-0 items-center gap-2 rounded-lg text-slate-50">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white shadow-sm"><Sparkles className="size-3.5" aria-hidden /></span>
          <span className="truncate text-sm font-bold tracking-tight">Prospecta</span>
        </Link>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300"><ShieldCheck className="size-3.5" aria-hidden />Seguro</span>
      </header>
      <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
