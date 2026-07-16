import RoadmapFeaturePage from '@/components/RoadmapFeaturePage';

export default function DeploymentAssistantPage() {
  return (
    <RoadmapFeaturePage
      eyebrow="Stage 4 · Deployment"
      title="AI-Assisted Deployment"
      badge="Exploratory"
      badgeColor="slate"
      gradient="from-slate-600 to-slate-800"
      icon={(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-white">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.01M10 8h8" /><path d="M6 12h.01M10 12h8" /><path d="M6 16h.01M10 16h8" />
        </svg>
      )}
      tagline="Automate promoting Data Cloud configuration from one environment to another - e.g. Sandbox to Production."
      steps={[
        { title: 'Connect source and target environments', description: 'Point at the org you\'re deploying from and the org you\'re deploying to.' },
        { title: 'Package the configuration to promote', description: 'Identify the Data Streams, DMOs, Calculated Insights, Segments, and other metadata that need to move.' },
        { title: 'Validate before promoting', description: 'Catch dependency or environment-mismatch issues before anything is deployed.' },
        { title: 'Automate the deployment', description: 'Push the validated change set from source to target.' }
      ]}
      note="This one is still in research: Data Cloud doesn't yet have a mature CLI-first deployment story, so we're evaluating Data Cloud's DataKit tooling, the Metadata API, and CLI-based approaches before committing to a design. Expect this stage to take longer than the others to reach even a first version."
    />
  );
}
