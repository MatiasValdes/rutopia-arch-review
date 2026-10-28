import { createGitHubCheck, type GitHubCheckClient } from "@grok/agent-sdk/channels/github";
import { CHECK_NAME, reviewMarker } from "./repos.js";

export type ArchVerdict = "CUMPLE" | "CUMPLE CON OBSERVACIONES" | "NO CUMPLE";

export type ArchFinding = {
  severity: "bloqueante" | "importante" | "nit";
  path: string;
  detail: string;
};

export type PublishArchReviewInput = {
  github: GitHubCheckClient;
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  authorLogin: string;
  verdict: ArchVerdict;
  summary: string;
  findings: readonly ArchFinding[];
  nextStep: string;
};

export type PublishArchReviewResult = {
  posted: boolean;
  skipped?: boolean;
  reason?: string;
  commentUrl?: string;
  checkConclusion?: "success" | "failure";
  pr: string;
};

function flatten(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildCommentBody(input: {
  headSha: string;
  authorLogin: string;
  verdict: ArchVerdict;
  summary: string;
  findings: readonly ArchFinding[];
  nextStep: string;
  checkConclusion: "success" | "failure";
}): string {
  const login = input.authorLogin.replace(/^@/, "");
  const findingsBlock =
    input.findings.length === 0
      ? "Ninguno."
      : input.findings
          .map(
            (f) =>
              `- [${f.severity}] \`${flatten(f.path)}\` — ${flatten(f.detail)}`,
          )
          .join("\n");

  return [
    reviewMarker(input.headSha),
    "### Veredicto",
    `\`${input.verdict}\``,
    "",
    `Commit: \`${input.headSha}\``,
    "",
    `@${login} revisá estas observaciones y confirmá cuando las atiendas o respondas (un nuevo commit re-dispara la revisión y el check).`,
    "",
    "### Resumen",
    flatten(input.summary),
    "",
    "### Hallazgos",
    findingsBlock,
    "",
    "### Qué se revisó",
    "Capas, mamparos, encapsulado/persistencia, HTTP, seguridad, tests/tooling.",
    "",
    "### Check",
    `\`${CHECK_NAME}\` → ${input.checkConclusion}`,
    "",
    "### Siguiente paso",
    flatten(input.nextStep),
  ].join("\n");
}

export function conclusionForVerdict(verdict: ArchVerdict): "success" | "failure" {
  return verdict === "NO CUMPLE" ? "failure" : "success";
}

export async function alreadyReviewedSha(args: {
  github: GitHubCheckClient;
  owner: string;
  repo: string;
  number: number;
  headSha: string;
}): Promise<boolean> {
  const octokit = await args.github.getOctokit();
  const marker = reviewMarker(args.headSha);
  const { data: comments } = await octokit.rest.issues.listComments({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.number,
    per_page: 100,
  });
  return comments.some((c) => typeof c.body === "string" && c.body.includes(marker));
}

export async function publishArchReview(
  input: PublishArchReviewInput,
): Promise<PublishArchReviewResult> {
  const pr = `${input.owner}/${input.repo}#${input.number}`;
  const already = await alreadyReviewedSha({
    github: input.github,
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    headSha: input.headSha,
  });
  if (already) {
    return { posted: false, skipped: true, reason: "already-reviewed-sha", pr };
  }

  const checkConclusion = conclusionForVerdict(input.verdict);
  const body = buildCommentBody({
    headSha: input.headSha,
    authorLogin: input.authorLogin,
    verdict: input.verdict,
    summary: input.summary,
    findings: input.findings,
    nextStep: input.nextStep,
    checkConclusion,
  });

  const octokit = await input.github.getOctokit();
  const response = await octokit.rest.issues.createComment({
    owner: input.owner,
    repo: input.repo,
    issue_number: input.number,
    body,
  });

  const check = await createGitHubCheck({
    github: input.github,
    owner: input.owner,
    repo: input.repo,
    name: CHECK_NAME,
    sha: input.headSha,
    output: {
      title: input.verdict,
      summary: flatten(input.summary).slice(0, 500),
    },
  });
  await check.conclude({
    conclusion: checkConclusion,
    output: {
      title: input.verdict,
      summary: flatten(input.summary).slice(0, 500),
    },
  });

  return {
    posted: true,
    commentUrl: response.data.html_url,
    checkConclusion,
    pr,
  };
}
