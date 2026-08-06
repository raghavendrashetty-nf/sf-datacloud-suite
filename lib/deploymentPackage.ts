// Shared types + pure package.xml generation for the Deployment Package Builder. No jsforce
// import here on purpose - this file is safe to import from client components, unlike
// lib/dataCloudClient.ts (server-only, pulls in the live connection).

export interface DeployableItem { fullName: string; label: string; }

export interface DeployableCategory {
  xmlName: string;
  category: string;
  order: number;
  supported: boolean;
  unsupportedReason?: string;
  items: DeployableItem[];
}

export interface PackageComponentSelection {
  xmlName: string;
  members: string[];
}

// Standard Salesforce Metadata API package.xml, identical in shape whether the type is a
// core-platform type (ApexClass, Flow, ...) or a Data Cloud type (DataStreamDefinition,
// MktCalcInsightObjectDef, ...) - confirmed via Salesforce's Metadata API Developer Guide's
// "Data 360 Metadata Types" reference page, which documents these exact type names as real,
// versioned Metadata API components deployable/retrievable via package.xml like any other type.
export function buildPackageXml(selections: PackageComponentSelection[], apiVersion: string): string {
  const typesXml = selections
    .filter((s) => s.members.length > 0)
    .map((s) => {
      const membersXml = s.members.map((m) => `    <members>${escapeXml(m)}</members>`).join('\n');
      return `  <types>\n${membersXml}\n    <name>${escapeXml(s.xmlName)}</name>\n  </types>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${typesXml}\n  <version>${apiVersion}</version>\n</Package>\n`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Salesforce's own documented dependency order for Data Cloud deployments (Data Lake Objects ->
// Data Streams -> DMOs / mappings -> Calculated Insights -> Segments -> Activation Targets), per
// the Apex Hours / official CLI deploy guide. Data Lake Objects (MktDataTranObject) come first -
// confirmed live: deploying a Data Stream that references one which doesn't yet exist in the
// target org fails with "no MktDataTranObject named X found", since the Data Stream only stores
// a reference to it, not a copy. Identity Resolution has no standalone Metadata API type
// (confirmed via research) so it never appears here - it isn't independently packageable this way.
export const DEPLOYMENT_ORDER_NOTE =
  'Deployment order follows Salesforce\'s documented Data Cloud dependency chain: Data Lake Objects -> Data Streams -> Source-to-DMO Field Mappings -> Calculated Insights -> Segment Definitions -> Activation Platforms. Components are listed in that order below - selecting a Data Stream automatically selects its matching Data Lake Object too, so the deploy won\'t fail looking for it in the target org. A Data Stream\'s underlying connector (e.g. File Upload) is not deployable this way at all - Salesforce marks that type internal-use-only - so recreate the connector manually in the target org first, under the same name, before deploying the Data Stream. Data Kits (Data Cloud Setup -> Data Kit Studio) are Salesforce\'s own atomic-bundle mechanism, but this app currently cannot compute a deployable package from one via API - use this component-selection flow instead.';
