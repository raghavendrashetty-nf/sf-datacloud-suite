import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/serverLogger";
import type { FieldMetadata } from "@/lib/readinessTypes";
export const runtime = "nodejs";
export const maxDuration = 30;
async function sfLogin(c: any, log: ReturnType<typeof createLogger>) {
  const url = (c.loginUrl || "https://login.salesforce.com").replace(/\/$/, "");
  const envelope = '<?xml version="1.0" encoding="utf-8" ?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><n1:login xmlns:n1="urn:partner.soap.sforce.com"><n1:username>' + c.username + '</n1:username><n1:password>' + c.password + (c.securityToken || "") + '</n1:password></n1:login></env:Body></env:Envelope>';
  log.http("POST " + url + "/services/Soap/u/59.0");
  const r = await fetch(url + "/services/Soap/u/59.0", { method: "POST", headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: "login" }, body: envelope });
  const t = await r.text();
  log.info("SOAP login response", { status: r.status });
  if (!r.ok) throw new Error("Salesforce login failed: " + (t.match(/<faultstring>(.*?)<\/faultstring>/)?.[1] || r.status));
  const sid = t.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const su = t.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1];
  if (!sid || !su) throw new Error("Login parse failed");
  return { sessionId: sid, instanceUrl: su.replace(/\/services\/Soap.*$/, "") };
}
async function salesforceFields(creds: any, object: string, log: ReturnType<typeof createLogger>): Promise<FieldMetadata[]> {
  const { sessionId, instanceUrl } = await sfLogin(creds, log);
  const url = instanceUrl + "/services/data/v59.0/sobjects/" + object + "/describe";
  log.http("GET " + url);
  const r = await fetch(url, { headers: { Authorization: "Bearer " + sessionId } });
  const d = await r.json();
  log.info("Describe response", { object, status: r.status, fieldCount: d.fields?.length });
  if (!r.ok) throw new Error("Describe error: " + JSON.stringify(d));
  return (d.fields || []).map((f: any) => ({ name: f.name, label: f.label, type: f.type, nillable: f.nillable }));
}
const ZENDESK_FIELDS: Record<string, FieldMetadata[]> = {
  tickets: [
    { name: "id", label: "ID", type: "number" },
    { name: "subject", label: "Subject", type: "string" },
    { name: "description", label: "Description", type: "string" },
    { name: "status", label: "Status", type: "string" },
    { name: "priority", label: "Priority", type: "string" },
    { name: "requester_id", label: "Requester ID", type: "number" },
    { name: "assignee_id", label: "Assignee ID", type: "number" },
    { name: "organization_id", label: "Organization ID", type: "number" },
    { name: "external_id", label: "External ID", type: "string" },
    { name: "created_at", label: "Created At", type: "datetime" },
    { name: "updated_at", label: "Updated At", type: "datetime" }
  ],
  users: [
    { name: "id", label: "ID", type: "number" },
    { name: "name", label: "Name", type: "string" },
    { name: "email", label: "Email", type: "string" },
    { name: "phone", label: "Phone", type: "string" },
    { name: "organization_id", label: "Organization ID", type: "number" },
    { name: "role", label: "Role", type: "string" },
    { name: "external_id", label: "External ID", type: "string" },
    { name: "created_at", label: "Created At", type: "datetime" },
    { name: "updated_at", label: "Updated At", type: "datetime" }
  ],
  organizations: [
    { name: "id", label: "ID", type: "number" },
    { name: "name", label: "Name", type: "string" },
    { name: "external_id", label: "External ID", type: "string" },
    { name: "created_at", label: "Created At", type: "datetime" },
    { name: "updated_at", label: "Updated At", type: "datetime" }
  ]
};
async function zendeskFields(object: string, log: ReturnType<typeof createLogger>): Promise<FieldMetadata[]> {
  log.info("Returning static Zendesk field list", { object });
  const fields = ZENDESK_FIELDS[object];
  if (!fields) throw new Error("Unknown Zendesk object: " + object);
  return fields;
}
async function sharepointFields(creds: any, listId: string, log: ReturnType<typeof createLogger>): Promise<FieldMetadata[]> {
  const body = new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  log.http("POST https://login.microsoftonline.com/" + creds.tenantId + "/oauth2/v2.0/token");
  const tr = await fetch("https://login.microsoftonline.com/" + creds.tenantId + "/oauth2/v2.0/token", { method: "POST", body });
  const td = await tr.json();
  if (!tr.ok) throw new Error("SP auth: " + (td.error_description || tr.status));
  const auth = { Authorization: "Bearer " + td.access_token };
  const url = "https://graph.microsoft.com/v1.0/sites/" + creds.siteId + "/lists/" + listId + "/columns";
  log.http("GET " + url);
  const r = await fetch(url, { headers: auth });
  const d = await r.json();
  log.info("Columns received", { status: r.status, count: d.value?.length });
  if (d.error) throw new Error("Columns error: " + d.error.message);
  return (d.value || []).map((c: any) => ({ name: c.name, label: c.displayName || c.name, type: c.text ? "string" : (c.number ? "number" : c.dateTime ? "datetime" : "other") }));
}
export async function POST(req: NextRequest) {
  const log = createLogger();
  try {
    const { systemId, credentials, object } = await req.json();
    log.info("Fields request received", { systemId, object });
    let fields: FieldMetadata[];
    if (systemId === "salesforce") fields = await salesforceFields(credentials, object, log);
    else if (systemId === "zendesk") fields = await zendeskFields(object, log);
    else if (systemId === "sharepoint") fields = await sharepointFields(credentials, object, log);
    else throw new Error("Unknown system: " + systemId);
    log.info("Fields fetch complete", { fieldCount: fields.length });
    return NextResponse.json({ system: systemId, object, fields, logs: log.logs });
  } catch (e: any) {
    log.error(e.message);
    return NextResponse.json({ error: e.message || "Unknown error", logs: log.logs }, { status: 500 });
  }
}
