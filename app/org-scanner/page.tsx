import RoadmapFeaturePage from '@/components/RoadmapFeaturePage';

export default function OrgScannerPage() {
  return (
    <RoadmapFeaturePage
      eyebrow="Stage 3 · Implementation Review"
      title="AI-Assisted Org Scanner"
      badge="Planned"
      badgeColor="amber"
      gradient="from-teal-500 to-cyan-500"
      icon={(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-white">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )}
      tagline="Connect to a live Data Cloud instance, scan the existing configuration, and get justified recommendations for a specific solution under review."
      steps={[
        { title: 'Connect to a Data 360 instance', description: 'Reuses the same secure, server-memory-only connection pattern already built for Data Readiness Assessment.' },
        { title: 'Scan existing configuration', description: 'Inventories Data Streams, DMOs, Calculated Insights, Identity Resolution, Segments, and Activations already deployed.' },
        { title: 'Specify the solution to review', description: 'Tell it which use case or requirement you’re validating the org against.' },
        { title: 'Review implementation & get recommendations', description: 'Receive findings on the current setup plus concrete suggestions - each with a clear justification, not just a flag.' }
      ]}
      note="This is a natural extension of the live Salesforce connection already powering Data Readiness Assessment - just pointed at configuration metadata instead of data quality."
    />
  );
}
