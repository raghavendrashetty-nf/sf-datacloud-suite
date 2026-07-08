import { FeatureCard } from "@/components/landing/FeatureCard";
export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <h1 className="text-xl font-semibold text-slate-900">Salesforce Data Cloud Suite</h1>
          <p className="text-sm text-slate-500 mt-0.5">Discovery-phase toolkit for Data Cloud (Data 360) engagements</p>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900">Choose a tool to get started</h2>
          <p className="mt-3 text-slate-600">Estimate implementation cost, validate source-system readiness, or read the methodology docs.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard href="/credit-calculator" iconBg="bg-blue-600" title="Credit Consumption Analyser" description="Every rate-sheet item as its own input, rate metric in every tooltip, Initial vs Incremental split, scenarios and PDF export." badge="v3.4" iconPath="M3 3h18v18H3z M9 17V9m4 8V5m4 12v-6" />
          <FeatureCard href="/data-readiness" iconBg="bg-emerald-600" title="Data Readiness Validator" description="Saved connections, live backend console, rules with object + dependent field dropdowns, accurate COUNT_DISTINCT duplicate scans." badge="v1.3" iconPath="M9 12l2 2 4-4 M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z" />
          <FeatureCard href="/documentation" iconBg="bg-purple-600" title="Documentation" description="Full methodology: formulas, rate tables, API endpoints, security notes, and extension guides. Fully editable content." badge="v1.0" iconPath="M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4V4z M4 4v12a4 4 0 004 4h12" />
        </div>
      </div>
    </main>
  );
}
