"use client";
import { Header } from "@/components/Header";
import { RateSheetEditor } from "@/components/RateSheetEditor";
export default function Page() {
  return (<main className="min-h-screen bg-slate-50"><Header title="Rate Configuration" subtitle="Edit multipliers and credit rates that drive the calculator" /><div className="max-w-6xl mx-auto px-6 py-6"><RateSheetEditor /></div></main>);
}
