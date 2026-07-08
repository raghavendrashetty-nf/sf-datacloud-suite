"use client";
import Link from "next/link";
import { Header } from "@/components/Header";
import { DocumentationRenderer } from "@/components/DocumentationRenderer";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { useDocumentation } from "@/hooks/useDocumentation";
export default function Page() {
  const { docs } = useDocumentation();
  return (
    <main className="min-h-screen bg-slate-50">
      <Header title="Documentation" subtitle="Complete methodology, formulas, and reference tables" badge={"v" + docs?.meta?.version}>
        <Link href="/documentation/settings" className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg">Settings</Link>
        <ExportPDFButton targetId="documentation-report" filename="datacloud-suite-documentation.pdf" />
      </Header>
      <div id="documentation-report" className="max-w-7xl mx-auto px-6 py-8">
        <DocumentationRenderer docs={docs} />
      </div>
    </main>
  );
}
