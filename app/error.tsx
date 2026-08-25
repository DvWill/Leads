"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-9 text-rose-600" aria-hidden />
        <h1 className="mt-4 text-xl font-bold text-slate-950">Não foi possível carregar esta página</h1>
        <p className="mt-2 text-sm text-slate-500">Tente novamente. Se o problema persistir, fale com o administrador.</p>
        <Button className="mt-6" onClick={reset}>Tentar novamente</Button>
      </div>
    </main>
  );
}
