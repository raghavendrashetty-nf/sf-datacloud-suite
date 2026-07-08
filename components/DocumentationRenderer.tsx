"use client";
import { useEffect, useState } from "react";
function Block({ block }: { block: any }) {
  if (block.type === "heading") {
    const level = block.level || 2;
    return level === 3 ? <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-2">{block.text}</h3> : <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-3">{block.text}</h2>;
  }
  if (block.type === "paragraph") return <p className="text-sm text-slate-700 leading-relaxed my-3">{block.text}</p>;
  if (block.type === "list") return (<ul className="list-disc pl-6 space-y-1 my-3 text-sm text-slate-700">{block.items.map((it: string, i: number) => <li key={i}>{it}</li>)}</ul>);
  if (block.type === "code") return (<pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs font-mono overflow-x-auto my-3 whitespace-pre-wrap">{block.content}</pre>);
  if (block.type === "table") return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
          <tr>{block.columns.map((c: string, i: number) => <th key={i} className="px-3 py-2 text-left font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {block.rows.map((row: string[], i: number) => (
            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 text-slate-700 font-mono text-[11px]">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (block.type === "note") {
    const tone = block.tone || "info";
    const cls = tone === "warn" ? "bg-amber-50 border-amber-200 text-amber-900" : tone === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-blue-50 border-blue-200 text-blue-900";
    return (<div className={"my-3 rounded-lg border px-4 py-3 text-sm " + cls}><strong className="uppercase text-[10px] tracking-wider">{tone}</strong><div className="mt-1">{block.text}</div></div>);
  }
  return null;
}
export function DocumentationRenderer({ docs }: { docs: any }) {
  const [activeId, setActiveId] = useState<string>("");
  useEffect(() => { if (docs?.sections?.length) setActiveId(docs.sections[0].id); }, [docs]);
  const jumpTo = (id: string) => {
    setActiveId(id);
    const el = document.getElementById("doc-section-" + id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (!docs || !docs.sections) return <div className="text-slate-500 text-sm">No documentation available.</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <aside className="lg:col-span-1">
        <nav className="sticky top-4 space-y-1 bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1">Contents</div>
          {docs.sections.map((s: any) => (
            <button key={s.id} onClick={() => jumpTo(s.id)} className={"w-full text-left px-2 py-1.5 rounded-md text-sm transition " + (activeId === s.id ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700 hover:bg-slate-50")}>
              {s.title}
            </button>
          ))}
          <div className="text-[10px] text-slate-400 px-2 mt-3 pt-3 border-t border-slate-100">v{docs.meta?.version} - {docs.meta?.lastUpdatedISO}</div>
        </nav>
      </aside>
      <main className="lg:col-span-3 space-y-8">
        {docs.sections.map((s: any) => (
          <section key={s.id} id={"doc-section-" + s.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm scroll-mt-24">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">{s.title}</h2>
            {s.blocks.map((b: any, i: number) => <Block key={i} block={b} />)}
          </section>
        ))}
      </main>
    </div>
  );
}
