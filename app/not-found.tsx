import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="text-center">
        <SearchX className="mx-auto size-10 text-slate-400" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Página não encontrada</h1>
        <p className="mt-2 text-slate-500">O endereço pode ter mudado ou você não tem acesso.</p>
        <Link className="mt-6 inline-flex rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" href="/dashboard">Voltar ao painel</Link>
      </div>
    </main>
  );
}
