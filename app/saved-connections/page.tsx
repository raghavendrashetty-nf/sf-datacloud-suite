'use client';

import Header from '@/components/Header';
import SavedConnectionsManager from '@/components/SavedConnectionsManager';

export default function SavedConnectionsPage() {
  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold">
            Shared Across Tools
          </div>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">Saved Org Connections</h1>
          <p className="mt-2 text-slate-600 max-w-2xl">
            Save a Salesforce org connection once, then reuse it from Org Scanner or either side of Deployment Assistant without re-entering credentials each time.
          </p>
        </div>
        <SavedConnectionsManager />
      </div>
      <footer className="py-6 text-center text-xs text-slate-500">
        Not affiliated with Salesforce.
      </footer>
    </main>
  );
}
