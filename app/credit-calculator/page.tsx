"use client";
import Link from "next/link";
import { useCalculator } from "@/hooks/useCalculator";
import { CalculatorForm } from "@/components/CalculatorForm";
import { ResultsPanel } from "@/components/ResultsPanel";
import { ScenariosManager } from "@/components/ScenariosManager";
import { ExportPDFButton } from "@/components/ExportPDFButton";
import { Header } from "@/components/Header";
import { useRates } from "@/hooks/useRates";
export default function Page() {
  const { rates } = useRates();
  const { inputs, update, reset, setAll, result } = useCalculator(rates);
  return (
    <main className="min-h-screen bg-slate-50">
      <Header title="Credit Consumption Analyser" subtitle="Hover any field label for the per-item credit rate. All inputs start at 0." badge={"Schema v" + rates.meta.schemaVersion}>
        <Link href="/credit-calculator/settings" className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg">Settings</Link>
        <ExportPDFButton targetId="calc-report" filename="datacloud-credit-estimate.pdf" />
      </Header>
      <div className="max-w-7xl mx-auto px-6 py-6 no-print">
        <ScenariosManager inputs={inputs} onLoad={setAll} />
      </div>
      <div id="calc-report" className="max-w-7xl mx-auto px-6 pb-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3"><CalculatorForm inputs={inputs} update={update} reset={reset} rates={rates} /></div>
        <div className="lg:col-span-2"><ResultsPanel result={result} inputs={inputs} rates={rates} /></div>
      </div>
    </main>
  );
}
