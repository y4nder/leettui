#!/usr/bin/env bun
// Throwaway spike probe (phase 01-02, Task 1/2) — NOT shipped in the compiled
// binary and never imported from src/. Validates the reverse-engineered
// `submissionList` GraphQL shape (RESEARCH.md Assumptions A1-A6) and observes
// real rate-limit behavior (A7-A8) against the user's live, saved LeetCode
// session, so `src/api/queries/submission-list.ts` and the backfill service's
// defaults can be locked from evidence rather than guesses.
//
// Usage: bun scripts/spike-submission-list.ts [questionSlug]
//   questionSlug defaults to "two-sum" — pass a slug you've actually attempted
//   if that page comes back empty.
//
// Read-only against LeetCode: GraphQL queries only, no run/submit/cancel.

import { hasTokens, loadConfig } from "../src/config";
import { initClient } from "../src/api/client";
import { gqlQuery } from "../src/api/graphql";
import { fetchSubmissionList } from "../src/api/queries/submission-list";
import type { SubmissionListData } from "../src/api/queries/submission-list";
import { errMessage } from "../src/debug";

const SLUG = process.argv[2] ?? "two-sum";

function section(title: string): void {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

async function probePerQuestion(): Promise<void> {
  section(`(a) Per-question submissionList("${SLUG}", offset=0)`);
  try {
    const page = await fetchSubmissionList(SLUG, 0);
    console.log(JSON.stringify(page, null, 2));
    const first = page.submissionList.submissions[0];
    if (first) {
      console.log("\n--- Field-shape observations ---");
      console.log(`id: "${first.id}" (typeof ${typeof first.id})`);
      const asSeconds = Number(first.timestamp) * 1000;
      const asMillis = Number(first.timestamp);
      console.log(`timestamp raw: "${first.timestamp}"`);
      console.log(`  if SECONDS -> ${new Date(asSeconds).toISOString()}`);
      console.log(`  if already MS -> ${new Date(asMillis).toISOString()}`);
      console.log(`runtime: "${first.runtime}", memory: "${first.memory}"`);
      console.log(`isPending: "${first.isPending}"`);
      console.log(`hasNext: ${page.submissionList.hasNext}`);
    } else {
      console.log(
        `No submissions returned for "${SLUG}". Try a slug you've actually attempted:\n` +
          `  bun scripts/spike-submission-list.ts <slug>`,
      );
    }
  } catch (e) {
    console.error(`Per-question call FAILED: ${errMessage(e)}`);
  }
}

async function probeGlobalFeed(): Promise<void> {
  section("(b) Global submissionList(offset=0) — no questionSlug (scope check, A5/Pitfall 3)");
  const GLOBAL_QUERY = `
query submissionList($offset: Int!, $limit: Int!) {
    submissionList(offset: $offset, limit: $limit) {
        hasNext
        submissions {
            id lang timestamp statusDisplay runtime memory title titleSlug isPending url
        }
    }
}`;
  try {
    const global = await gqlQuery<SubmissionListData>(GLOBAL_QUERY, { offset: 0, limit: 20 });
    const slugs = [...new Set(global.submissionList.submissions.map((s) => s.titleSlug))];
    console.log(`Returned ${global.submissionList.submissions.length} submissions.`);
    console.log(`Distinct titleSlugs on this page: ${slugs.join(", ") || "(none)"}`);
    console.log("First row:", JSON.stringify(global.submissionList.submissions[0], null, 2));
  } catch (e) {
    console.error(`Global call FAILED (may be an unsupported variant): ${errMessage(e)}`);
  }
}

async function probeBurst(): Promise<void> {
  section("(c) Burst probe — rapid-fire paging with NO delay, to find the 429 threshold");
  const BURST_COUNT = 30;
  let burstFailAt: number | null = null;
  for (let i = 0; i < BURST_COUNT; i++) {
    const start = Date.now();
    try {
      await fetchSubmissionList(SLUG, i * 20);
      console.log(`  request ${i + 1}/${BURST_COUNT}: ok (${Date.now() - start}ms)`);
    } catch (e) {
      const msg = errMessage(e);
      console.log(`  request ${i + 1}/${BURST_COUNT}: FAILED (${Date.now() - start}ms) — ${msg}`);
      if (msg.includes("429") && burstFailAt === null) burstFailAt = i + 1;
    }
  }
  console.log(
    burstFailAt !== null
      ? `\n429 first observed at request #${burstFailAt} with zero delay between requests.`
      : `\nNo 429 observed across ${BURST_COUNT} zero-delay requests — threshold is higher than this burst (or generous).`,
  );
}

async function probeCadence(): Promise<void> {
  section("(d) Cadence probe — ~1000ms inter-page delay (candidate safe default, A8)");
  const CADENCE_COUNT = 10;
  let anyFailed = false;
  for (let i = 0; i < CADENCE_COUNT; i++) {
    try {
      await fetchSubmissionList(SLUG, i * 20);
      console.log(`  request ${i + 1}/${CADENCE_COUNT}: ok`);
    } catch (e) {
      anyFailed = true;
      console.log(`  request ${i + 1}/${CADENCE_COUNT}: FAILED — ${errMessage(e)}`);
    }
    if (i < CADENCE_COUNT - 1) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(
    anyFailed
      ? "\n1000ms delay still hit a failure — needs a longer delay or backoff kicked in for a different reason."
      : "\n1000ms delay completed cleanly across 10 requests — reasonable safe-default candidate.",
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!hasTokens(config)) {
    console.error("No saved LeetCode session found. Run `bun src/index.tsx auth` first.");
    process.exit(1);
  }
  initClient(config.csrftoken, config.lc_session);

  await probePerQuestion();
  await probeGlobalFeed();
  await probeBurst();
  await probeCadence();

  section("Done — feed the observations above into the Task 2 checkpoint response.");
}

await main();
