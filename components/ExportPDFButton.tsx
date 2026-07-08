"use client";
import { useState } from "react";
import { exportElementToPDF } from "@/lib/pdfExporter";
export function ExportPDFButton({ targetId, filename, label = "Export PDF" }: { targetId: string; filename: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => { setBusy(true); try { await exportElementToPDF(targetId, filename); } catch (e: any) { alert("Export failed: " + e.message); } finally { setBusy(false); } };
  return (
    <button disabled={busy} onClick={onClick} className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition inline-flex items-center gap-2">
      {busy ? "Generating..." : "📄 " + label}
    </button>
  );
}
