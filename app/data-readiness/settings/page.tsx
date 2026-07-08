"use client";
import { Header } from "@/components/Header";
import { ReadinessConfigEditor } from "@/components/ReadinessConfigEditor";
export default function Page() {
  return (<main className="min-h-screen bg-slate-50"><Header title="Readiness Configuration" subtitle="Edit systems, credential fields, and default check options" /><div className="max-w-6xl mx-auto px-6 py-6"><ReadinessConfigEditor /></div></main>);
}
