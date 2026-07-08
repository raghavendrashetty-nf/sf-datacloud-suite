"use client";
import { useState } from "react";
import { useDocumentation } from "@/hooks/useDocumentation";
export function DocumentationEditor() {
  const { docs, save, reset } = useDocumentation();
  const [draft, setDraft] = useState<string>(JSON.stringify(docs, null, 2));
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    try {
      const parsed = JSON.parse(draft);
      if (!parsed.sections || !Array.isArray(parsed.sections)) throw new Error("Documentation must contain a 'sections' array");
      save(parsed); setError(null); alert("Documentation saved.");
    } catch (e: any) { setError(e.message); }
  };
  const doReset = () => { if (confirm("Reset documentation to defaults?")) { reset(); setDraft(JSON.stringify(docs, null, 2)); location.reload(); } };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <p className="text-sm text-slate-600">Edit the raw JSON. Each section has an id, title, and array of blocks (heading, paragraph, list, code, table, note).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={doReset} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg">Reset to Defaults</button>
          <button onClick={commit} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Save Changes</button>
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">Parse error: {error}</div>}
      <textarea value={draft} onChange={e => setDraft(e.target.value)} spellCheck={false} className="w-full h-[70vh] font-mono text-xs bg-slate-900 text-slate-100 rounded-lg p-4 border border-slate-700 outline-none" />
    </div>
  );
}
