import Link from "next/link";

export function Pagination({ page, pages, searchParams }: { page: number; pages: number; searchParams: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  function href(next: number) { const query = new URLSearchParams(); for (const [key, value] of Object.entries(searchParams)) { if (value) query.set(key, value); } query.set("page", String(next)); return `?${query}`; }
  return <nav className="flex items-center justify-between border-t px-4 py-3 text-sm sm:px-6" aria-label="Paginação"><span className="text-slate-500">Página {page} de {pages}</span><div className="flex gap-2"><Link aria-disabled={page <= 1} className={`rounded-lg border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`} href={href(page - 1)}>Anterior</Link><Link aria-disabled={page >= pages} className={`rounded-lg border px-3 py-1.5 ${page >= pages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`} href={href(page + 1)}>Próxima</Link></div></nav>;
}
