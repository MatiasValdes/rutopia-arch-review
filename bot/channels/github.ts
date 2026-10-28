import {
  defaultGitHubPullRequestDispatch,
  githubChannel,
} from "@grok/agent-sdk/channels/github";
import { alreadyReviewedSha, publishArchReview } from "../lib/publish.js";
import { BOT_NAME, CHECK_NAME, REPOS, dedupeKey, watches } from "../lib/repos.js";

const MAX_DIFF_CHARS = 150_000;

/**
 * Production path: Cursor-hosted agent + cursor events on REPOS.
 * Local path: playground / evals only — do not rely on `github replay`.
 */
export default githubChannel({
  botName: BOT_NAME,
  cursorAccount: { repos: [...REPOS], permissions: "contents-write" },
  checks: true,
  // Diff + instructions are enough; avoid spinning a cloud checkout per PR.
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

    const pull = {
      owner: ctx.repository.owner,
      repo: ctx.repository.name,
      pull_number: pr.number,
    };

    let meta;
    let diffText = "";
    try {
      const octokit = await ctx.github.getOctokit();
      const [metaRes, diffRes] = await Promise.all([
        octokit.rest.pulls.get(pull),
        octokit.rest.pulls.get({ ...pull, mediaType: { format: "diff" } }),
      ]);
      meta = metaRes.data;
      diffText = typeof diffRes.data === "string" ? diffRes.data : "";
    } catch (error) {
      // Without GitHub credentials (local playground) we cannot review a live PR.
      console.error(
        `[rutopia-arch-review] skip PR #${pr.number}: cannot read pull/diff`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }

    const headSha = meta.head.sha;
    const authorLogin = meta.user?.login ?? "unknown";
    const baseRef = meta.base.ref;
    const kvKey = dedupeKey(
      ctx.repository.owner,
      ctx.repository.name,
      pr.number,
      headSha,
    );

    if ((await ctx.host.kv.get(kvKey)) !== undefined) {
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
                detail:
                  "Base actual: master. Usá otra base (cualquier rama ≠ master).",
              },
            ],
            nextStep:
              "Cambiá la base del PR y esperá el re-análisis en el nuevo HEAD.",
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

    const metaJson = JSON.stringify(
      {
        number: pr.number,
        title: meta.title,
        draft: meta.draft,
        authorLogin,
        baseRef,
        headRef: meta.head.ref,
        headSha,
        htmlUrl: meta.html_url,
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
            diffText.length > MAX_DIFF_CHARS
              ? `${diffText.slice(0, MAX_DIFF_CHARS)}\n…[truncated]\n`
              : diffText,
          "pr/head.sha": headSha,
          "pr/meta.json": metaJson,
        };
      },
    };
  },
});
