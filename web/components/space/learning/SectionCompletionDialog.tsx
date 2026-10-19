"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MasteryTopic } from "@/lib/learning-api";
import { Dialog } from "@/shared/ui/Dialog";

/** A section is complete when its knowledge point has passed its mastery gate. */
export function SectionCompletionDialog({ topic }: { topic: Pick<MasteryTopic, "path_id" | "map"> | null }) {
  const { t } = useTranslation();
  const previous = useRef<{ pathId: string; completed: Map<string, boolean> } | null>(null);
  const [pending, setPending] = useState<{ pathId: string; names: string[] } | null>(null);

  useEffect(() => {
    if (!topic) return;
    const points = topic.map.modules.flatMap(module => module.knowledge_points);
    const completed = new Map(points.map(point => [point.id, point.status === "mastered"]));
    const before = previous.current;
    previous.current = { pathId: topic.path_id, completed };
    if (!before || before.pathId !== topic.path_id) return;
    const names = points
      .filter(point => before.completed.get(point.id) === false && completed.get(point.id))
      .map(point => point.name);
    if (!names.length) return;
    // Queue simultaneous completions so each section gets its own acknowledgement.
    setPending(current => ({
      pathId: topic.path_id,
      names: [...(current?.pathId === topic.path_id ? current.names : []), ...names],
    }));
  }, [topic]);

  const name = pending?.pathId === topic?.path_id ? pending?.names[0] : undefined;
  const dismiss = () => setPending(current => current ? { ...current, names: current.names.slice(1) } : null);

  return (
    <Dialog
      open={name !== undefined}
      title={t("🎉 Congratulations on completing this section!")}
      onClose={dismiss}
      closeLabel={t("Close")}
      size="sm"
      footer={
        <button type="button" onClick={dismiss} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]">
          {t("Keep learning")}
        </button>
      }
    >
      <p className="text-center text-base font-semibold">{name}</p>
      <p className="mt-3 text-center text-3xl font-semibold text-[var(--primary)]">100%</p>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        {t("Another step mastered. Keep up the great work!")}
      </p>
    </Dialog>
  );
}
