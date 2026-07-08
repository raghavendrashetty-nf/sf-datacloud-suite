import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/serverLogger";
import type { ReadinessReport, CheckResult, EntityMetric, ObjectDupResult, Rule } from "@/lib/readinessTypes";
export const runtime = "nodejs";
export const maxDuration = 120;

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
async function sfQuery(iu: string, sid: string, soql: string, log: ReturnType<typeof createLogger>) {
  log.soql(soql);
  const t0 = Date.now();
  const r = await fetch(iu + "/services/data/v59.0/query?q=" + encodeURIComponent(soql), { headers: { Authorization: "Bearer " + sid } });
  const d = await r.json();
  log.info("SOQL response", { status: r.status, ms: Date.now() - t0, totalSize: d.totalSize });
  if (!r.ok) throw new Error("SOQL error: " + JSON.stringify(d));
  return d;
}

function statusOf(rate: number, threshold: number): ObjectDupResult["status"] {
  const pct = rate * 100;
  if (pct <= threshold) return "pass";
  if (pct <= threshold * 2) return "warn";
  return "fail";
}
function scoreOf(rate: number) { return Math.max(0, 100 - Math.round(rate * 400)); }

async function salesforceDuplicates(creds: any, rules: Rule[], log: ReturnType<typeof createLogger>) {
  const { sessionId, instanceUrl } = await sfLogin(creds, log);
  log.info("Session established", { instanceUrl });
  const objectResults: ObjectDupResult[] = [];
  const entities: EntityMetric[] = [];
  const recs: string[] = [];
  for (const rule of rules) {
    log.info("Executing rule with COUNT_DISTINCT", { ruleId: rule.id, object: rule.object, field: rule.field, threshold: rule.threshold });
    try {
      const total = await sfQuery(instanceUrl, sessionId, "SELECT COUNT() FROM " + rule.object, log);
      const totalCount = total.totalSize || 0;
      const nonNull = await sfQuery(instanceUrl, sessionId, "SELECT COUNT() FROM " + rule.object + " WHERE " + rule.field + " != null", log);
      const nonNullCount = nonNull.totalSize || 0;
      const distinct = await sfQuery(instanceUrl, sessionId, "SELECT COUNT_DISTINCT(" + rule.field + ") v FROM " + rule.object + " WHERE " + rule.field + " != null", log);
      const uniqueValues = distinct.records?.[0]?.v || 0;
      log.info("Distinct value count (exact)", { object: rule.object, field: rule.field, uniqueValues });
      const duplicateExtras = Math.max(0, nonNullCount - uniqueValues);
      const duplicateRate = nonNullCount > 0 ? duplicateExtras / nonNullCount : 0;
      let topDuplicates: Array<{ value: string; count: number }> = [];
      let sampleCappedAt200 = false;
      try {
        const dupResp = await sfQuery(instanceUrl, sessionId, "SELECT " + rule.field + ", COUNT(Id) c FROM " + rule.object + " WHERE " + rule.field + " != null GROUP BY " + rule.field + " HAVING COUNT(Id) > 1 ORDER BY COUNT(Id) DESC LIMIT 200", log);
        const dupGroups = dupResp.records || [];
        if (dupGroups.length === 200) {
          sampleCappedAt200 = true;
          log.warn("Top-duplicates sample capped at 200. Distinct count from COUNT_DISTINCT is still accurate.", { ruleId: rule.id });
        }
        topDuplicates = dupGroups.slice(0, 5).map((r: any) => ({ value: String(r[rule.field]), count: r.c }));
      } catch (e: any) {
        log.warn("Top-duplicates sample failed (COUNT_DISTINCT metrics still valid)", { ruleId: rule.id, error: e.message });
      }
      const score = scoreOf(duplicateRate);
      const status = statusOf(duplicateRate, rule.threshold);
      log.info("Rule result", { ruleId: rule.id, duplicateRate: (duplicateRate * 100).toFixed(2) + "%", score, status, method: "COUNT_DISTINCT" });
      objectResults.push({
        ruleId: rule.id, object: rule.object, field: rule.field,
        totalRecords: totalCount, nonNullRecords: nonNullCount,
        uniqueValues, duplicateRows: duplicateExtras,
        uniqueDuplicateValues: topDuplicates.length,
        duplicateRate, score, status, topDuplicates,
        method: sampleCappedAt200 ? "COUNT_DISTINCT (accurate); top sample capped" : "COUNT_DISTINCT (accurate)"
      });
      entities.push({ entity: rule.object, recordCount: totalCount, duplicateRate });
      if (duplicateRate * 100 > rule.threshold) recs.push(rule.object + "." + rule.field + ": " + (duplicateRate * 100).toFixed(2) + "% duplicate rate exceeds " + rule.threshold + "% threshold (COUNT_DISTINCT accurate).");
    } catch (e: any) {
      log.error("Rule failed", { ruleId: rule.id, error: e.message });
      recs.push(rule.object + "." + rule.field + ": failed - " + e.message);
    }
  }
  return { objectResults, entities, recs };
}

async function zendeskDuplicates(creds: any, rules: Rule[], log: ReturnType<typeof createLogger>) {
  const base = "https://" + creds.subdomain + ".zendesk.com/api/v2";
  const auth = "Basic " + Buffer.from(creds.email + "/token:" + creds.apiToken).toString("base64");
  const objectResults: ObjectDupResult[] = [];
  const entities: EntityMetric[] = [];
  const recs: string[] = [];
  for (const rule of rules) {
    log.info("Executing Zendesk rule (sampled)", { ruleId: rule.id, object: rule.object, field: rule.field });
    try {
      log.http("GET " + base + "/" + rule.object + "/count.json");
      const cResp = await fetch(base + "/" + rule.object + "/count.json", { headers: { Authorization: auth } });
      const cData = await cResp.json();
      const totalCount = cData.count?.value || 0;
      log.info("Total count", { object: rule.object, count: totalCount });
      const pages = Math.min(5, Math.max(1, Math.ceil(totalCount / 100)));
      const seen = new Map<string, number>();
      let sampled = 0;
      for (let p = 1; p <= pages; p++) {
        log.http("GET " + base + "/" + rule.object + ".json?per_page=100&page=" + p);
        const r = await fetch(base + "/" + rule.object + ".json?per_page=100&page=" + p, { headers: { Authorization: auth } });
        if (!r.ok) { log.warn("Page fetch failed", { page: p, status: r.status }); break; }
        const d = await r.json();
        const arr = d[rule.object] || [];
        arr.forEach((rec: any) => { const v = rec[rule.field]; sampled++; if (v != null && v !== "") seen.set(String(v), (seen.get(String(v)) || 0) + 1); });
        log.info("Page processed", { page: p, records: arr.length, sampledTotal: sampled });
        if (arr.length < 100) break;
      }
      const uniqueValues = seen.size;
      const duplicateExtras = Math.max(0, sampled - uniqueValues);
      const duplicateRate = sampled > 0 ? duplicateExtras / sampled : 0;
      const dupGroups = Array.from(seen.entries()).filter(([, c]) => c > 1);
      const topDuplicates = dupGroups.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, c]) => ({ value: v, count: c }));
      const score = scoreOf(duplicateRate);
      const status = statusOf(duplicateRate, rule.threshold);
      log.info("Rule result", { ruleId: rule.id, uniqueValues, duplicateExtras, duplicateRate: (duplicateRate * 100).toFixed(2) + "%", score, status });
      objectResults.push({
        ruleId: rule.id, object: rule.object, field: rule.field,
        totalRecords: totalCount, nonNullRecords: sampled,
        uniqueValues, duplicateRows: duplicateExtras,
        uniqueDuplicateValues: dupGroups.length,
        duplicateRate, score, status, topDuplicates,
        method: "sampled-paginated (up to 5 pages)"
      });
      entities.push({ entity: rule.object, recordCount: totalCount, duplicateRate });
      if (duplicateRate * 100 > rule.threshold) recs.push(rule.object + "." + rule.field + ": " + (duplicateRate * 100).toFixed(2) + "% duplicate rate exceeds " + rule.threshold + "% threshold (sampled).");
    } catch (e: any) {
      log.error("Rule failed", { ruleId: rule.id, error: e.message });
      recs.push(rule.object + "." + rule.field + ": failed - " + e.message);
    }
  }
  return { objectResults, entities, recs };
}

async function sharepointDuplicates(creds: any, rules: Rule[], log: ReturnType<typeof createLogger>) {
  const tokenBody = new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  log.http("POST https://login.microsoftonline.com/" + creds.tenantId + "/oauth2/v2.0/token");
  const tr = await fetch("https://login.microsoftonline.com/" + creds.tenantId + "/oauth2/v2.0/token", { method: "POST", body: tokenBody });
  const td = await tr.json();
  log.info("Token response", { status: tr.status });
  if (!tr.ok) throw new Error("SP auth: " + (td.error_description || tr.status));
  const auth = { Authorization: "Bearer " + td.access_token };
  const objectResults: ObjectDupResult[] = [];
  const entities: EntityMetric[] = [];
  const recs: string[] = [];
  for (const rule of rules) {
    log.info("Executing SharePoint rule (listing)", { ruleId: rule.id, listId: rule.object, field: rule.field });
    try {
      log.http("GET https://graph.microsoft.com/v1.0/sites/" + creds.siteId + "/lists/" + rule.object + "/items?$expand=fields&$top=1000");
      const items = await (await fetch("https://graph.microsoft.com/v1.0/sites/" + creds.siteId + "/lists/" + rule.object + "/items?$expand=fields&$top=1000", { headers: auth })).json();
      const rows = items.value || [];
      log.info("Items fetched", { listId: rule.object, count: rows.length });
      const seen = new Map<string, number>();
      rows.forEach((r: any) => { const v = r.fields?.[rule.field]; if (v != null && v !== "") seen.set(String(v), (seen.get(String(v)) || 0) + 1); });
      const uniqueValues = seen.size;
      const duplicateExtras = Math.max(0, rows.length - uniqueValues);
      const duplicateRate = rows.length > 0 ? duplicateExtras / rows.length : 0;
      const dupGroups = Array.from(seen.entries()).filter(([, c]) => c > 1);
      const topDuplicates = dupGroups.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, c]) => ({ value: v, count: c }));
      const score = scoreOf(duplicateRate);
      const status = statusOf(duplicateRate, rule.threshold);
      log.info("Rule result", { ruleId: rule.id, uniqueValues, duplicateExtras, duplicateRate: (duplicateRate * 100).toFixed(2) + "%", score, status });
      objectResults.push({
        ruleId: rule.id, object: rule.object, field: rule.field,
        totalRecords: rows.length, nonNullRecords: rows.length,
        uniqueValues, duplicateRows: duplicateExtras,
        uniqueDuplicateValues: dupGroups.length,
        duplicateRate, score, status, topDuplicates,
        method: "listing-1000-items"
      });
      entities.push({ entity: rule.object, recordCount: rows.length, duplicateRate });
      if (duplicateRate * 100 > rule.threshold) recs.push(rule.object + "." + rule.field + ": " + (duplicateRate * 100).toFixed(2) + "% duplicate rate exceeds " + rule.threshold + "% threshold.");
    } catch (e: any) {
      log.error("Rule failed", { ruleId: rule.id, error: e.message });
      recs.push(rule.object + "." + rule.field + ": failed - " + e.message);
    }
  }
  return { objectResults, entities, recs };
}

export async function POST(req: NextRequest) {
  const log = createLogger();
  try {
    const { systemId, credentials, options } = await req.json();
    const rules: Rule[] = options?.rules || [];
    log.info("Duplicate check request received", { systemId, ruleCount: rules.length });
    if (rules.length === 0) throw new Error("No rules provided");
    let out;
    if (systemId === "salesforce") out = await salesforceDuplicates(credentials, rules, log);
    else if (systemId === "zendesk") out = await zendeskDuplicates(credentials, rules, log);
    else if (systemId === "sharepoint") out = await sharepointDuplicates(credentials, rules, log);
    else throw new Error("Unknown system: " + systemId);

    const overallScore = out.objectResults.length > 0 ? Math.round(out.objectResults.reduce((s, o) => s + o.score, 0) / out.objectResults.length) : 0;
    const rating: ReadinessReport["overallRating"] = overallScore >= 80 ? "Ready" : overallScore >= 60 ? "Needs Work" : "At Risk";
    log.info("Aggregation complete", { overallScore, rating, ruleCount: out.objectResults.length });

    const checks: CheckResult[] = [
      { key: "connectivity", label: "Connectivity", score: 100, status: "pass", detail: systemId + " reachable and authenticated." },
      { key: "duplicates", label: "Duplicate values across rules", score: overallScore, status: overallScore >= 80 ? "pass" : overallScore >= 60 ? "warn" : "fail", detail: "Averaged across " + out.objectResults.length + " rule(s).", metrics: { rules: out.objectResults.length, avgScore: overallScore } }
    ];
    if (out.recs.length === 0) out.recs.push("All rules pass the duplicate threshold. Proceed with confidence.");

    const report: ReadinessReport = {
      system: systemId,
      connectedAs: credentials.username || credentials.email || credentials.clientId,
      connectedAt: new Date().toISOString(),
      overallScore, overallRating: rating,
      checks, entities: out.entities, recommendations: out.recs,
      objectResults: out.objectResults, logs: log.logs
    };
    return NextResponse.json(report);
  } catch (e: any) {
    log.error(e.message);
    return NextResponse.json({ error: e.message || "Unknown error", logs: log.logs }, { status: 500 });
  }
}
