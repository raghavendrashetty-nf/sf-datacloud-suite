import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/serverLogger";
export const runtime = "nodejs";
export const maxDuration = 30;

async function testSalesforce(c: any, log: ReturnType<typeof createLogger>) {
  const url = (c.loginUrl || "https://login.salesforce.com").replace(/\/$/, "");
  const envelope = '<?xml version="1.0" encoding="utf-8" ?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><n1:login xmlns:n1="urn:partner.soap.sforce.com"><n1:username>' + c.username + '</n1:username><n1:password>' + c.password + (c.securityToken || "") + '</n1:password></n1:login></env:Body></env:Envelope>';
  log.http("POST " + url + "/services/Soap/u/59.0");
  const r = await fetch(url + "/services/Soap/u/59.0", { method: "POST", headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: "login" }, body: envelope });
  const t = await r.text();
  log.info("SOAP response", { status: r.status });
  if (!r.ok) throw new Error("Salesforce login failed: " + (t.match(/<faultstring>(.*?)<\/faultstring>/)?.[1] || r.status));
  const sid = t.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  if (!sid) throw new Error("No sessionId returned");
  return { ok: true, message: "Connected as " + c.username };
}
async function testZendesk(c: any, log: ReturnType<typeof createLogger>) {
  const auth = "Basic " + Buffer.from(c.email + "/token:" + c.apiToken).toString("base64");
  const url = "https://" + c.subdomain + ".zendesk.com/api/v2/users/me.json";
  log.http("GET " + url);
  const r = await fetch(url, { headers: { Authorization: auth } });
  const d = await r.json();
  log.info("Response", { status: r.status });
  if (!r.ok) throw new Error("Zendesk error: " + (d.error || r.status));
  return { ok: true, message: "Connected as " + (d.user?.email || "unknown") };
}
async function testSharePoint(c: any, log: ReturnType<typeof createLogger>) {
  const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  log.http("POST https://login.microsoftonline.com/" + c.tenantId + "/oauth2/v2.0/token");
  const r = await fetch("https://login.microsoftonline.com/" + c.tenantId + "/oauth2/v2.0/token", { method: "POST", body });
  const d = await r.json();
  log.info("Token response", { status: r.status });
  if (!r.ok) throw new Error("SharePoint auth failed: " + (d.error_description || r.status));
  log.http("GET https://graph.microsoft.com/v1.0/sites/" + c.siteId);
  const s = await (await fetch("https://graph.microsoft.com/v1.0/sites/" + c.siteId, { headers: { Authorization: "Bearer " + d.access_token } })).json();
  if (s.error) throw new Error("Site error: " + s.error.message);
  return { ok: true, message: "Site: " + (s.displayName || s.name) };
}
export async function POST(req: NextRequest) {
  const log = createLogger();
  try {
    const { systemId, credentials } = await req.json();
    log.info("Test connection request received", { systemId });
    let res;
    if (systemId === "salesforce") res = await testSalesforce(credentials, log);
    else if (systemId === "zendesk") res = await testZendesk(credentials, log);
    else if (systemId === "sharepoint") res = await testSharePoint(credentials, log);
    else throw new Error("Unknown system: " + systemId);
    return NextResponse.json({ ...res, logs: log.logs });
  } catch (e: any) {
    log.error(e.message);
    return NextResponse.json({ ok: false, error: e.message || "Unknown error", logs: log.logs }, { status: 400 });
  }
}
