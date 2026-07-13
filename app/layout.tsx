import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NeuraFlash Data Cloud Suite',
  description: 'Credit Consumption Calculator and Data Readiness Assessment for Salesforce Data Cloud.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
