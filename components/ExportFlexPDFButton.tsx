'use client';

import { useState } from 'react';
import type { FlexCalculationResult, FlexCalculatorInputs, FlexRatesConfig } from '@/lib/flexCreditsCalculator';
import { generateFlexPDFReport } from '@/lib/flexPdfReport';

interface Props {
  rates: FlexRatesConfig; inputs: FlexCalculatorInputs; result: FlexCalculationResult;
}

export default function ExportFlexPDFButton({ rates, inputs, result }: Props) {
  const [busy, setBusy] = useState(false);
  async function onClick() {
    if (busy) return;
    setBusy(true);
    try { await generateFlexPDFReport({ rates, inputs, result }); }
    finally { setBusy(false); }
  }
  return (
    <button onClick={onClick} disabled={busy}
      className="btn-primary no-print disabled:opacity-60 w-full text-sm"
      title="Generate a professional PDF report">
      {busy ? 'Generating...' : 'Export PDF Report'}
    </button>
  );
}
