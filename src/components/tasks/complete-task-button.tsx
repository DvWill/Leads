"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

export function CompleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function complete() {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
      if (!response.ok) throw new Error();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }
  return (
    <button onClick={complete} disabled={loading} className="focus-ring grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600" aria-label="Concluir tarefa">
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
    </button>
  );
}
