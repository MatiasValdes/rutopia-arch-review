import { defineEval, includes } from "@grok/agent-sdk/evals";

const OPENED = [
  "GitHub pull request trigger: MatiasValdes/rutopia_backend#12",
  "Action: opened",
  "PR: https://github.com/MatiasValdes/rutopia_backend/pull/12",
  "Title: Add catalog endpoint",
  "Head: feat/catalog (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)",
  "Base: development",
  "Author: contributor",
  "",
  "Read pr/diff.patch and pr/meta.json.",
  "Call publish_arch_review once with the structured verdict.",
].join("\n");

const META = JSON.stringify(
  {
    number: 12,
    title: "Add catalog endpoint",
    draft: false,
    authorLogin: "contributor",
    baseRef: "development",
    headRef: "feat/catalog",
    headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    htmlUrl: "https://github.com/MatiasValdes/rutopia_backend/pull/12",
  },
  null,
  2,
);

export default defineEval({
  tags: ["smoke"],
  cases: [
    {
      id: "layer-violation",
      description: "Domain importing Fastify is posted as NO CUMPLE / bloqueante.",
      async test(t) {
        await t.send(OPENED, {
          workspaceFiles: {
            "pr/diff.patch": [
              "diff --git a/apps/api/src/catalogo/dominio/reglas.ts b/apps/api/src/catalogo/dominio/reglas.ts",
              "+import Fastify from 'fastify';",
              "+export const app = Fastify();",
            ].join("\n"),
            "pr/head.sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "pr/meta.json": META,
          },
        });
        t.succeeded();
        t.calledTool("publish_arch_review");
        t.check(t.reply, includes(/no cumple|bloqueante|dominio|fastify/i));
      },
    },
    {
      id: "docs-only-ok",
      description: "Docs-only change posts CUMPLE.",
      async test(t) {
        await t.send(OPENED.replace("Add catalog endpoint", "Docs"), {
          workspaceFiles: {
            "pr/diff.patch": ["diff --git a/README.md b/README.md", "+# note"].join(
              "\n",
            ),
            "pr/head.sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "pr/meta.json": META.replace("Add catalog endpoint", "Docs"),
          },
        });
        t.succeeded();
        t.calledTool("publish_arch_review");
        t.check(t.reply, includes(/cumple/i));
      },
    },
  ],
});
