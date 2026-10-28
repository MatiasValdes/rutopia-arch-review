import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  // Cursor Auto / Router (same intent as Automations model "Auto")
  model: {
    id: "auto-smart",
    params: [{ id: "optimize_for", value: "balanced" }],
  },
  tools: ["read", "grep"],
  local: {
    sandbox: true,
  },
});
