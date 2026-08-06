---
name: best-practices-add
description: Add a new Salesforce Data Cloud best-practice entry to this app's Best Practices page from a source URL the user provides. Use when the user shares a link (blog post, Salesforce doc, help article) and asks to add it to Best Practices, or says something like "add this to best practices" / "feed this into the best practices page".
---

# Adding a Best Practice from a Source Link

This app (`sf-datacloud-suite`) has a Best Practices page (`app/best-practices/page.tsx`) backed
by `config/bestPracticesDefault.json`, grouped into 5 stages: `discovery`, `solution_design`,
`implementation`, `deployment`, `operate_optimize`. The user grows this library over time by
handing you new source links one at a time. This skill is how you turn a link into a correctly
shaped, grounded entry.

## Steps

1. **Fetch the real content.** Use WebFetch (or WebSearch first if the URL is ambiguous/broken)
   to read the actual page. Ask for a prompt like: *"Summarize the concrete, actionable best
   practices from this article... List each as a separate bullet with enough detail to be useful
   on its own. Note title, author/site name, and publish date if shown."*
   - **Never fabricate practices.** Every bullet in the entry must trace back to something the
     fetched content actually said. If the fetch fails or the page has no concrete practices, tell
     the user rather than inventing content.

2. **Read the current file** at `config/bestPracticesDefault.json` to see existing `stages` and
   avoid duplicating an entry for the same URL (check `sourceUrl` first).

3. **Pick the right stage** from the 5 available (`discovery`, `solution_design`,
   `implementation`, `deployment`, `operate_optimize`) based on what the content is actually
   about - e.g. cost/credit optimization and monitoring guidance -> `operate_optimize`;
   architecture/design tradeoffs before building -> `solution_design`; migration/CI-CD mechanics
   -> `deployment`. If genuinely torn between two, pick the one the majority of points fall under.

4. **Build the entry** matching this exact shape (see any existing entry in the file for a live
   example):
   ```json
   {
     "id": "<kebab-case-slug>-<yyyy-mm-or-yyyy-mm-dd>",
     "stage": "<one of the 5 stage keys>",
     "title": "<article's real title>",
     "summary": "<1-2 sentence takeaway, written by you, grounded in the fetched content>",
     "points": [
       { "text": "<concrete practice>", "impact": "<optional - only if the source states a specific number/stat>" }
     ],
     "sourceUrl": "<the exact URL given>",
     "sourceName": "<site/author name>",
     "publishDate": "<if shown, else omit the field entirely>",
     "addedDate": "<today's date, YYYY-MM-DD>"
   }
   ```
   - Only include `impact` when the source states a concrete number/percentage/stat for that
     specific point - don't invent one, don't add it to every point.
   - `id` must be unique against existing entries.

5. **Append the entry** to the `practices` array in `config/bestPracticesDefault.json` using Edit
   (not a full rewrite), and bump `meta.lastUpdated` to today's date.

6. **Verify**: run `npx tsc --noEmit` (the file is imported and typed via `lib/bestPractices.ts`'s
   `BestPracticesConfig` interface - a malformed entry will show as a type error there) and confirm
   the JSON parses (e.g. `python3 -m json.tool config/bestPracticesDefault.json > /dev/null`).

7. **Report back concisely**: which stage you filed it under and why, how many practices you
   extracted, and a one-line pointer to view it at `/best-practices`.

## If the user provides multiple links at once

Repeat steps 1-5 for each one before the single verification pass in step 6, rather than
building/verifying/rebuilding per link - cheaper and just as safe since step 6 checks the whole
file.

## Do not

- Do not restyle or refactor `app/best-practices/page.tsx`, `lib/bestPractices.ts`, or the stage
  list as part of this skill - only append to `practices`. If the user wants a new stage or a UI
  change, that's a separate, explicit request.
- Do not remove or edit existing entries unless the user explicitly asks you to update one.
