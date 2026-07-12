import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Salesforce Data Cloud - Credit Consumption Calculator',
  description:
    'Estimate Salesforce Data Cloud (Data 360) credit consumption and USD cost during Discovery.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen">{children}</body>
    </html>
  );
}
