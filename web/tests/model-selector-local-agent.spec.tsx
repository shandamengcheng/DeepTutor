import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ModelSelector from "@/components/chat/home/ModelSelector";
import { initI18n } from "@/i18n/init";

initI18n("en");

describe("ModelSelector local Agent targets", () => {
  it("defaults to the first local Agent when no target is selected", () => {
    const onChange = vi.fn();
    const onLocalAgentChange = vi.fn();

    render(
      <ModelSelector
        options={[]}
        localAgents={[
          { name: "Codex", kind: "codex" },
          { name: "Claude", kind: "claude_code" },
        ]}
        selectedLocalAgent={null}
        activeDefault={null}
        value={null}
        loading={false}
        error
        onChange={onChange}
        onLocalAgentChange={onLocalAgentChange}
      />,
    );

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onLocalAgentChange).toHaveBeenCalledWith("Codex");
    expect(onLocalAgentChange).not.toHaveBeenCalledWith("Claude");
  });

  it("restores the sole local Agent when session configuration clears the selection", () => {
    const onChange = vi.fn();
    const onLocalAgentChange = vi.fn();
    const props = {
      options: [],
      localAgents: [{ name: "Codex", kind: "codex" }],
      activeDefault: null,
      value: null,
      loading: false,
      error: true,
      onChange,
      onLocalAgentChange,
    };

    const { rerender } = render(
      <ModelSelector {...props} selectedLocalAgent={null} />,
    );
    rerender(<ModelSelector {...props} selectedLocalAgent="Codex" />);
    rerender(<ModelSelector {...props} selectedLocalAgent={null} />);

    expect(onLocalAgentChange).toHaveBeenCalledTimes(2);
    expect(onLocalAgentChange).toHaveBeenNthCalledWith(1, "Codex");
    expect(onLocalAgentChange).toHaveBeenNthCalledWith(2, "Codex");
  });

  it("ignores a stale active LLM and defaults to the first available Agent", () => {
    const onChange = vi.fn();
    const onLocalAgentChange = vi.fn();

    render(
      <ModelSelector
        options={[]}
        localAgents={[{ name: "Codex", kind: "codex" }]}
        selectedLocalAgent={null}
        activeDefault={{ profile_id: "removed-profile", model_id: "removed-model" }}
        value={null}
        loading={false}
        error
        onChange={onChange}
        onLocalAgentChange={onLocalAgentChange}
      />,
    );

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onLocalAgentChange).toHaveBeenCalledWith("Codex");
  });

  it("ignores a stale local Agent name and defaults to the first available Agent", () => {
    const onChange = vi.fn();
    const onLocalAgentChange = vi.fn();

    render(
      <ModelSelector
        options={[]}
        localAgents={[{ name: "Codex", kind: "codex" }]}
        selectedLocalAgent="Removed Agent"
        activeDefault={null}
        value={null}
        loading={false}
        error
        onChange={onChange}
        onLocalAgentChange={onLocalAgentChange}
      />,
    );

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onLocalAgentChange).toHaveBeenCalledWith("Codex");
  });

  it("defaults to the first LLM when no local Agent or active default exists", () => {
    const onChange = vi.fn();
    const onLocalAgentChange = vi.fn();

    render(
      <ModelSelector
        options={[
          {
            profile_id: "profile-1",
            model_id: "model-1",
            profile_name: "OpenAI",
            model_name: "First model",
            model: "first-model",
            provider: "openai",
            is_active_default: false,
          },
          {
            profile_id: "profile-2",
            model_id: "model-2",
            profile_name: "OpenAI",
            model_name: "Second model",
            model: "second-model",
            provider: "openai",
            is_active_default: false,
          },
        ]}
        activeDefault={null}
        value={null}
        loading={false}
        error={false}
        onChange={onChange}
        onLocalAgentChange={onLocalAgentChange}
      />,
    );

    expect(onChange).toHaveBeenCalledWith({
      profile_id: "profile-1",
      model_id: "model-1",
    });
  });

  it("keeps a local Agent selectable when cloud model loading failed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onLocalAgentChange = vi.fn();

    render(
      <ModelSelector
        options={[]}
        localAgents={[{ name: "Codex", kind: "codex" }]}
        selectedLocalAgent={null}
        activeDefault={null}
        value={null}
        loading={false}
        error
        onChange={onChange}
        onLocalAgentChange={onLocalAgentChange}
        onRefresh={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.click(screen.getByRole("button", { name: "Codex" }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onLocalAgentChange).toHaveBeenCalledWith("Codex");
  });

  it("switching to an LLM clears the selected local Agent", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onLocalAgentChange = vi.fn();

    render(
      <ModelSelector
        options={[
          {
            profile_id: "profile-1",
            model_id: "model-1",
            profile_name: "OpenAI",
            model_name: "GPT Test",
            model: "gpt-test",
            provider: "openai",
            is_active_default: false,
          },
        ]}
        localAgents={[{ name: "Codex", kind: "codex" }]}
        selectedLocalAgent="Codex"
        activeDefault={null}
        value={null}
        loading={false}
        error={false}
        onChange={onChange}
        onLocalAgentChange={onLocalAgentChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.click(screen.getByRole("button", { name: /GPT Test/i }));

    expect(onLocalAgentChange).toHaveBeenCalledWith(null);
    expect(onChange).toHaveBeenCalledWith({
      profile_id: "profile-1",
      model_id: "model-1",
    });
  });
});


describe("intentional target selection", () => {
  for (const action of ["System default", "Codex"]) {
    it(`preserves an intentional clear via ${action}`, async () => {
      function Controlled() {
        const [agent, setAgent] = useState<string | null>("Codex");
        return <>
          <span data-testid="agent">{agent ?? "none"}</span>
          <ModelSelector options={[]} localAgents={[{ name: "Codex" }]}
            selectedLocalAgent={agent} activeDefault={null} value={null}
            loading={false} error={false} allowSystemDefault
            onChange={() => {}} onLocalAgentChange={setAgent} />
        </>;
      }
      const user = userEvent.setup();
      render(<Controlled />);
      await user.click(screen.getByRole("button", { name: "Select model" }));
      await user.click(screen.getByRole("button", { name: action === "System default" ? "Use the active default model from Settings" : action }));
      expect(screen.getByTestId("agent")).toHaveTextContent("none");
    });
  }
});
