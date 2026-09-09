"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DeepQuestionFormConfig } from "@/lib/quiz-types";
import type { DeepResearchFormConfig } from "@/lib/research-types";
import type { VisualizeFormConfig } from "@/lib/visualize-types";
import { browserStorage } from "@/shared/storage";

export interface CapabilityConfigSnapshot {
  quizConfig: DeepQuestionFormConfig;
  visualizeConfig: VisualizeFormConfig;
  researchConfig: DeepResearchFormConfig;
  capabilityConfigConfirmed: boolean;
}

export const RESEARCH_CONFIG_STORAGE_KEY = "dt:chat:research-config";

interface CapabilityConfigPersistenceOptions extends CapabilityConfigSnapshot {
  storageKey: string | null;
  researchStorageKey: string;
  setQuizConfig: Dispatch<SetStateAction<DeepQuestionFormConfig>>;
  setVisualizeConfig: Dispatch<SetStateAction<VisualizeFormConfig>>;
  setResearchConfig: Dispatch<SetStateAction<DeepResearchFormConfig>>;
  setCapabilityConfigConfirmed: Dispatch<SetStateAction<boolean>>;
}

export function useCapabilityConfigPersistence({
  storageKey,
  researchStorageKey,
  quizConfig,
  visualizeConfig,
  researchConfig,
  capabilityConfigConfirmed,
  setQuizConfig,
  setVisualizeConfig,
  setResearchConfig,
  setCapabilityConfigConfirmed,
}: CapabilityConfigPersistenceOptions): void {
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!storageKey) return;
    const raw = browserStorage.readRaw("local", storageKey);
    const rawResearch = browserStorage.readRaw("local", researchStorageKey);
    try {
      let sessionResearchConfig: DeepResearchFormConfig | undefined;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CapabilityConfigSnapshot>;
        if (parsed.quizConfig) setQuizConfig(parsed.quizConfig);
        if (parsed.visualizeConfig) setVisualizeConfig(parsed.visualizeConfig);
        sessionResearchConfig = parsed.researchConfig;
        if (typeof parsed.capabilityConfigConfirmed === "boolean") {
          setCapabilityConfigConfirmed(parsed.capabilityConfigConfirmed);
        }
      }
      const persistedResearchConfig = rawResearch
        ? (JSON.parse(rawResearch) as DeepResearchFormConfig)
        : sessionResearchConfig;
      if (persistedResearchConfig) {
        setResearchConfig(persistedResearchConfig);
      }
    } catch {
      /* corrupted entry — ignore */
    } finally {
      // Do not let the persistence effect write initial empty React state over
      // the value we are hydrating in this same effect flush.
      setHydratedStorageKey(storageKey);
    }
  }, [
    storageKey,
    researchStorageKey,
    setQuizConfig,
    setVisualizeConfig,
    setResearchConfig,
    setCapabilityConfigConfirmed,
  ]);

  useEffect(() => {
    if (!storageKey) return;
    if (hydratedStorageKey !== storageKey) return;
    browserStorage.writeRaw(
      "local",
      storageKey,
      JSON.stringify({
        quizConfig,
        visualizeConfig,
        researchConfig,
        capabilityConfigConfirmed,
      }),
    );
    browserStorage.writeRaw(
      "local",
      researchStorageKey,
      JSON.stringify(researchConfig),
    );
  }, [
    storageKey,
    hydratedStorageKey,
    researchStorageKey,
    quizConfig,
    visualizeConfig,
    researchConfig,
    capabilityConfigConfirmed,
  ]);
}
