import RoadmapFeaturePage from '@/components/RoadmapFeaturePage';

export default function SolutionRecommenderPage() {
  return (
    <RoadmapFeaturePage
      eyebrow="Stage 2 · Solution Design"
      title="AI-Assisted Solution Recommendation"
      badge="Planned"
      badgeColor="amber"
      gradient="from-violet-500 to-fuchsia-500"
      icon={(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-white">
          <path d="M12 2a7 7 0 00-4 12.7V17a2 2 0 002 2h4a2 2 0 002-2v-2.3A7 7 0 0012 2z" />
          <line x1="9" y1="21" x2="15" y2="21" />
        </svg>
      )}
      tagline="Turn a Statement of Work or Discovery Document into a grounded Data Cloud architecture recommendation - including SWOT and cost analysis."
      steps={[
        { title: 'Upload your SOW or Discovery Document', description: 'Bring in the raw scoping artifact you already have - no reformatting required.' },
        { title: 'Convert it into a structured prompt', description: 'The tool extracts requirements, data sources, and use cases into a prompt tuned for Data Cloud solutioning.' },
        { title: 'Leverage Data 360 Skills', description: 'Grounds recommendations in official Data Cloud capabilities, limits, and best practices - not generic guesses.' },
        { title: 'Get Design Recommendations', description: 'Receive a proposed architecture with a SWOT analysis and a cost analysis powered by the Credit Calculator already in this suite.' }
      ]}
      note="Once shipped, the cost analysis step will feed directly into the Advanced Credit Calculator's Refresh Mode and Pipeline modeling - so a recommendation and its estimate stay in sync."
    />
  );
}
