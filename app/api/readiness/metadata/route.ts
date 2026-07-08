import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/serverLogger";
import type { MetadataObject } from "@/lib/readinessTypes";
export const runtime = "nodejs";
export const maxDuration = 60;
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
async function salesforceMetadata(creds: any, log: ReturnType<typeof createLogger>): Promise<MetadataObject[]> {
  const { sessionId, instanceUrl } = await sfLogin(creds, log);
  log.info("Session established", { instanceUrl });
  const url = instanceUrl + "/services/data/v59.0/sobjects";
  log.http("GET " + url);
  const r = await fetch(url, { headers: { Authorization: "Bearer " + sessionId } });
  const d = await r.json();
  log.info("sObjects list received", { status: r.status, count: d.sobjects?.length });
  if (!r.ok) throw new Error("sObjects error: " + JSON.stringify(d));
  return (d.sobjects || []).filter((s: any) => s.queryable).map((s: any) => ({ name: s.name, label: s.label, queryable: s.queryable }));
}
async function zendeskMetadata(creds: any, log: ReturnType<typeof createLogger>): Promise<MetadataObject[]> {
  const base = "https://" + creds.subdomain + ".zendesk.com/api/v2";
  const auth = "Basic " + Buffer.from(creds.email + "/token:" + creds.apiToken).toString("base64");
  const objects: MetadataObject[] = [];
  for (const name of ["tickets", "users", "organizations"]) {
    log.http("GET " + base + "/" + name + "/count.json");
    try {
      const r = await fetch(base + "/" + name + "/count.json", { headers: { Authorization: auth } });
      const d = await r.json();
      log.info("Count fetched", { object: name, count: d.count?.value });
      objects.push({ name, label: name.charAt(0).toUpperCase() + name.slice(1), recordCount: d.count?.value, queryable: true });
    } catch (e: any) {
      log.warn("Count fetch failed", { object: name, error: e.message });
      objects.push({ name, label: name, queryable: true });
    }
  }
  return objects;
}
async function sharepointMetadata(creds: any, log: ReturnType<typeof createLogger>): Promise<MetadataObject[]> {
  const body = new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  log.http("POST https://login.microsoftonline.com/" + creds.tenantId + "/oauth2/v2.0/token");
  const tr = await fetch("https://login.microsoftonline.com/" + creds.tenantId + "/oauth2/v2.0/token", { method: "POST", body });
  const td = await tr.json();
  log.info("Token response", { status: tr.status });
  if (!tr.ok) throw new Error("SP auth: " + (td.error_description || tr.status));
  const auth = { Authorization: "Bearer " + td.access_token };
  const url = "https://graph.microsoft.com/v1.0/sites/" + creds.siteId + "/lists";
  log.http("GET " + url);
  const r = await fetch(url, { headers: auth });
  const d = await r.json();
  log.info("Lists received", { status: r.status, count: d.value?.length });
  if (d.error) throw new Error("Lists error: " + d.error.message);
  return (d.value || []).map((l: any) => ({ name: l.id, label: l.displayName || l.name, queryable: true }));
}
export async function POST(req: NextRequest) {
  const log = createLogger();
  try {
    const { systemId, credentials } = await req.json();
    log.info("Metadata request received", { systemId });
    let objects: MetadataObject[];
    if (systemId === "salesforce") objects = await salesforceMetadata(credentials, log);
    else if (systemId === "zendesk") objects = await zendeskMetadata(credentials, log);
    else if (systemId === "sharepoint") objects = await sharepointMetadata(credentials, log);
    else throw new Error("Unknown system: " + systemId);
    log.info("Metadata fetch complete", { objectCount: objects.length });
    return NextResponse.json({ system: systemId, objects, logs: log.logs });
  } catch (e: any) {
    log.error(e.message);
    return NextResponse.json({ error: e.message || "Unknown error", logs: log.logs }, { status: 500 });
  }
}
