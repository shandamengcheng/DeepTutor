import test from "node:test";
import assert from "node:assert/strict";

import { defaultLocalAgentName } from "../lib/local-agent-default";

const LOCAL_AGENT = { name: "我的 Codex", kind: "codex" };

test("defaults to the sole local agent when no LLM is configured", () => {
  assert.equal(
    defaultLocalAgentName({
      agents: [LOCAL_AGENT],
      hasConfiguredLLM: false,
      llmOptionsLoading: false,
      llmOptionsError: false,
    }),
    LOCAL_AGENT.name,
  );
});

test("does not guess during model loading, errors, or ambiguous agent choices", () => {
  const base = {
    agents: [LOCAL_AGENT],
    hasConfiguredLLM: false,
    llmOptionsLoading: false,
    llmOptionsError: false,
  };

  assert.equal(defaultLocalAgentName({ ...base, llmOptionsLoading: true }), null);
  assert.equal(defaultLocalAgentName({ ...base, llmOptionsError: true }), null);
  assert.equal(
    defaultLocalAgentName({
      ...base,
      agents: [LOCAL_AGENT, { name: "Claude", kind: "claude_code" }],
    }),
    null,
  );
  assert.equal(
    defaultLocalAgentName({
      ...base,
      agents: [{ name: "远程搭档", kind: "partner" }],
    }),
    null,
  );
});

test("keeps the agent unselected once a usable LLM profile is available", () => {
  assert.equal(
    defaultLocalAgentName({
      agents: [LOCAL_AGENT],
      hasConfiguredLLM: true,
      llmOptionsLoading: false,
      llmOptionsError: false,
    }),
    null,
  );
});
