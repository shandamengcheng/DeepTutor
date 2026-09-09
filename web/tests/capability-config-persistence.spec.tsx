import { renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  type CapabilityConfigSnapshot,
  RESEARCH_CONFIG_STORAGE_KEY,
  useCapabilityConfigPersistence,
} from "@/features/chat/hooks/useCapabilityConfigPersistence";
import { DEFAULT_QUIZ_CONFIG } from "@/lib/quiz-types";
import { DEFAULT_VISUALIZE_CONFIG } from "@/lib/visualize-types";

const storedSnapshot = (
  mode: CapabilityConfigSnapshot["researchConfig"]["mode"],
  depth: CapabilityConfigSnapshot["researchConfig"]["depth"],
): CapabilityConfigSnapshot => ({
  quizConfig: { ...DEFAULT_QUIZ_CONFIG },
  visualizeConfig: { ...DEFAULT_VISUALIZE_CONFIG },
  researchConfig: { mode, depth },
  capabilityConfigConfirmed: true,
});

function useHarness(storageKey: string) {
  const [quizConfig, setQuizConfig] = useState({ ...DEFAULT_QUIZ_CONFIG });
  const [visualizeConfig, setVisualizeConfig] = useState({
    ...DEFAULT_VISUALIZE_CONFIG,
  });
  const [researchConfig, setResearchConfig] = useState<
    CapabilityConfigSnapshot["researchConfig"]
  >({ mode: "", depth: "" });
  const [capabilityConfigConfirmed, setCapabilityConfigConfirmed] =
    useState(false);

  useCapabilityConfigPersistence({
    storageKey,
    researchStorageKey: RESEARCH_CONFIG_STORAGE_KEY,
    quizConfig,
    visualizeConfig,
    researchConfig,
    capabilityConfigConfirmed,
    setQuizConfig,
    setVisualizeConfig,
    setResearchConfig,
    setCapabilityConfigConfirmed,
  });

  return { researchConfig, capabilityConfigConfirmed };
}

describe("capability config persistence across sessions", () => {
  it("keeps saved research settings after the chat remounts for another session", () => {
    const legacyKeyA = "dt:chat:capability-config:session-a";
    const legacyKeyB = "dt:chat:capability-config:session-b";
    localStorage.setItem(
      legacyKeyA,
      JSON.stringify(storedSnapshot("notes", "quick")),
    );

    const first = renderHook(
      ({ storageKey }) => useHarness(storageKey),
      { initialProps: { storageKey: legacyKeyA } },
    );
    expect(first.result.current.researchConfig).toEqual({
      mode: "notes",
      depth: "quick",
    });
    first.unmount();

    const second = renderHook(() => useHarness(legacyKeyB));

    expect(second.result.current.researchConfig).toEqual({
      mode: "notes",
      depth: "quick",
    });
    expect(second.result.current.capabilityConfigConfirmed).toBe(false);
  });
});
