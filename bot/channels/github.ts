import {
  defaultGitHubPullRequestDispatch,
  githubChannel,
} from "@grok/agent-sdk/channels/github";
import { alreadyReviewedSha, publishArchReview } from "../lib/publish.js";
import { BOT_NAME, CHECK_NAME, REPOS, dedupeKey, watches } from "../lib/repos.js";

const MAX_DIFF_CHARS = 150_000;

export default githubChannel({
  botName: BOT_NAME,
  cursorAccount: { repos: [...REPOS] },
  checks: true,
  cloud: true,
  deliverReplies: false,
  onComment: () => null,
  onPullRequest: async (ctx, pr) => {
    if (!watches(ctx.repository.fullName)) {
      return null;
    }
    const dispatch = defaultGitHubPullRequestDispatch(ctx, pr);
    if (dispatch === null) {
      return null;
    }

    const octokit = await ctx.github.getOctokit();
    const pull = {
      owner: ctx.repository.owner,
      repo: ctx.repository.name,
      pull_number: pr.number,
    };
    const [meta, diff] = await Promise.all([
      octokit.rest.pulls.get(pull),
      octokit.rest.pulls.get({ ...pull, mediaType: { format: "diff" } }),
    ]);
    const headSha = meta.data.head.sha;
    const authorLogin = meta.data.user?.login ?? "unknown";
    const baseRef = meta.data.base.ref;
    const kvKey = dedupeKey(
      ctx.repository.owner,
      ctx.repository.name,
      pr.number,
      headSha,
    );

    const kvHit = await ctx.host.kv.get(kvKey);
    if (kvHit !== undefined) {
      return null;
    }
    if (
      await alreadyReviewedSha({
        github: ctx.github,
        owner: ctx.repository.owner,
        repo: ctx.repository.name,
        number: pr.number,
        headSha,
      })
    ) {
      await ctx.host.kv.put(kvKey, { reviewedAt: Date.now(), source: "comment" });
      return null;
    }

    // Hard gate: PRs targeting master fail without a model turn.
    if (baseRef === "master") {
      return {
        task: async () => {
          const result = await publishArchReview({
            github: ctx.github,
            owner: ctx.repository.owner,
            repo: ctx.repository.name,
            number: pr.number,
            headSha,
            authorLogin,
            verdict: "NO CUMPLE",
            summary:
              "Los PRs hacia `master` no se aceptan. Retargeteá a cualquier otra rama base.",
            findings: [
              {
                severity: "bloqueante",
                path: "(base branch)",
                detail: `Base actual: master. Usá otra base (opción A: cualquier rama ≠ master).`,
              },
            ],
            nextStep: "Cambiá la base del PR y esperá el re-análisis en el nuevo HEAD.",
          });
          if (result.posted) {
            await ctx.host.kv.put(kvKey, {
              reviewedAt: Date.now(),
              source: "master-gate",
              check: CHECK_NAME,
            });
          }
        },
      };
    }

    const text = typeof diff.data === "string" ? diff.data : "";
    const metaJson = JSON.stringify(
      {
        number: pr.number,
        title: meta.data.title,
        draft: meta.data.draft,
        authorLogin,
        baseRef,
        headRef: meta.data.head.ref,
        headSha,
        htmlUrl: meta.data.html_url,
      },
      null,
      2,
    );

    return {
      auth: dispatch.auth,
      context: [
        "Read pr/diff.patch and pr/meta.json.",
        "Call publish_arch_review once with the structured verdict.",
      ],
      async workspaceFiles() {
        return {
          "pr/diff.patch":
            text.length > MAX_DIFF_CHARS
              ? `${text.slice(0, MAX_DIFF_CHARS)}\n…[truncated]\n`
              : text,
          "pr/head.sha": headSha,
          "pr/meta.json": metaJson,
        };
      },
    };
  },
});
