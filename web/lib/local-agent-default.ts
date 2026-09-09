export interface ConnectedAgentOption {
  name: string;
  kind?: string;
}

/**
 * Pick the sole local CLI agent only when no configured LLM can handle a
 * turn. Partner connections are intentionally excluded: they are explicit
 * remote conversation targets, not a machine-local fallback.
 */
export function defaultLocalAgentName({
  agents,
  hasConfiguredLLM,
  llmOptionsLoading,
  llmOptionsError,
}: {
  agents: ConnectedAgentOption[];
  hasConfiguredLLM: boolean;
  llmOptionsLoading: boolean;
  llmOptionsError: boolean;
}): string | null {
  if (
    llmOptionsLoading ||
    llmOptionsError ||
    hasConfiguredLLM
  ) {
    return null;
  }

  const localAgents = agents.filter((agent) => agent.kind !== "partner");
  return localAgents.length === 1 ? localAgents[0].name : null;
}
