"use client";
import { Header } from "@/components/Header";
import { DocumentationEditor } from "@/components/DocumentationEditor";
export default function Page() {
  return (<main className="min-h-screen bg-slate-50"><Header title="Documentation Editor" subtitle="Edit the documentation JSON. Structure: sections with blocks (heading, paragraph, list, code, table, note)." /><div className="max-w-6xl mx-auto px-6 py-6"><DocumentationEditor /></div></main>);
}
