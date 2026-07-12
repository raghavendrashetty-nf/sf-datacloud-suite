'use client';

import { RefObject, useState } from 'react';
import type { CalculationResult, CalculatorInputs, RatesConfig } from '@/lib/types';
import { generatePDFReport } from '@/lib/pdfReport';

interface Props {
  rates: RatesConfig;
  inputs: CalculatorInputs;
  result: CalculationResult;
  chartsRef: RefObject<HTMLElement>;
}

export default function ExportPDFButton({ rates, inputs, result, chartsRef }: Props) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      await generatePDFReport({ rates, inputs, result, chartsEl: chartsRef.current });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick} disabled={busy}
      className="btn-primary no-print disabled:opacity-60 w-full text-sm"
      title="Generate a professional PDF report"
    >
      {busy ? 'Generating...' : 'Export PDF Report'}
    </button>
  );
}
