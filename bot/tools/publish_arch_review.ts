import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseGitHubPrContinuationKey } from "@grok/agent-sdk/channels/github";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  publishArchReview,
  type ArchFinding,
  type ArchVerdict,
} from "../lib/publish.js";
import { CHECK_NAME, dedupeKey } from "../lib/repos.js";

const SHA = /^[0-9a-f]{40}$/i;

const finding = z.object({
  severity: z.enum(["bloqueante", "importante", "nit"]),
  path: z.string().min(1).max(240),
  detail: z.string().min(1).max(400),
});

export default defineTool({
  description:
    "Publish the architecture review on this session's pull request: one PR comment (@author) and the rutopia-arch-review check run. Call once.",
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    verdict: z.enum(["CUMPLE", "CUMPLE CON OBSERVACIONES", "NO CUMPLE"]),
    summary: z.string().min(1).max(800),
    findings: z.array(finding).describe("Empty when CUMPLE with no notes."),
    nextStep: z.string().min(1).max(400),
    authorLogin: z
      .string()
      .min(1)
      .max(80)
      .describe("PR author login from pr/meta.json (without @)."),
  }),
  dryRunResult: {
    posted: false,
    reason: "dry-run",
    check: CHECK_NAME,
  },
  async execute({ verdict, summary, findings, nextStep, authorLogin }, ctx) {
    if (ctx.session.purpose === "eval") {
      return {
        posted: false,
        reason: "eval",
        verdict,
        findings: findings.length,
        check: CHECK_NAME,
      };
    }

    const ref = parseGitHubPrContinuationKey(ctx.session.continuationKey ?? "");
    if (ref === undefined) {
      throw new Error("publish_arch_review requires a GitHub pull request session");
    }

    const headSha = (await readFile(join(ctx.workspaceDir, "pr/head.sha"), "utf8")).trim();
    if (!SHA.test(headSha)) {
      throw new Error("missing or invalid pr/head.sha");
    }

    const result = await publishArchReview({
      github: ctx.host.github,
      owner: ref.owner,
      repo: ref.repo,
      number: ref.number,
      headSha,
      authorLogin,
      verdict: verdict as ArchVerdict,
      summary,
      findings: findings as ArchFinding[],
      nextStep,
    });

    if (result.posted) {
      await ctx.host.kv.put(
        dedupeKey(ref.owner, ref.repo, ref.number, headSha),
        { reviewedAt: Date.now(), source: "publish_arch_review", verdict },
      );
    }

    return result;
  },
});
