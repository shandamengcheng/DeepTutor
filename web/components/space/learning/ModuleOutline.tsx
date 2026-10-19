"use client"

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next"
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  CircleDot,
  Loader2,
  LockKeyhole,
  Sparkles,
  Undo2,
} from "lucide-react";

import {
  fetchObjectiveReport,
  type MapKnowledgePoint,
  type MasteryTopic,
  type ObjectiveReport,
} from "@/lib/learning-api";

import { masterySectionRoute, type MasterySectionSession } from '@/lib/mastery-study-route'

import { knowledgeTypeLabel, topicDisplayName, type Translate } from "./format";
import { ObjectiveDetail } from "./ObjectiveDetail"

function statusLabel(point: MapKnowledgePoint, t: Translate) {
  if (point.mastery_source === "learner") return t("Marked as known");
  if (point.status === "mastered") return t("Mastered");
  if (point.status === "learning") return t("In progress");
  return t("Not started");
}

function StatusMark({ point }: { point: MapKnowledgePoint }) {
  // Fill -> ring -> outline. Progression stays legible without inventing a
  // success colour the product does not have, and without relying on hue
  // alone to carry the state.
  const base =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border";
  if (point.status === "mastered") {
    return (
      <span
        className={`${base} border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]`}
      >
        {point.mastery_source === "learner" ? (
          <Sparkles className="h-3 w-3" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </span>
    );
  }
  if (point.status === "learning") {
    return (
      <span
        className={`${base} border-[var(--primary)] bg-[var(--card)] text-[var(--primary)]`}
      >
        <CircleDot className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      className={`${base} border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]`}
    >
      <Circle className="h-3 w-3" />
    </span>
  );
}

/**
 * The topic's modules and knowledge points, as an outline.
 *
 * This replaced an illustrated route map. The map filled the page's main
 * column but the only thing you could do with it was click a point — the same
 * affordance a list row gives in a fraction of the space, while showing far
 * more of the topic at once.
 */
export function ModuleOutline({
  topic,
  revision,
  selectedId,
  zh,
  onSelect,
  onOverride,
  sessions = [],
}: {
  topic: MasteryTopic
  revision: number;
  selectedId: string | null;
  zh: boolean;
  onSelect: (id: string | null) => void;
  onOverride: (
    objectiveId: string,
    mastered: boolean,
    note: string,
  ) => Promise<void>
  sessions?: readonly MasterySectionSession[]
}) {
  const { t } = useTranslation();
  const nextId = topic.next.knowledge_point_id;
  const topicName = topicDisplayName(topic, t)
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({})
  const defaultModuleId =
    topic.map.modules.find(module => module.knowledge_points.some(point => point.id === nextId))
      ?.id ?? topic.map.modules[0]?.id
  const isOpen = (module: MasteryTopic['map']['modules'][number]) =>
    module.knowledge_points.some(point => point.id === selectedId) ||
    (openModules[module.id] ?? module.id === defaultModuleId)
  const allOpen = topic.map.modules.every(isOpen)

  return (
    // One card per module rather than one card divided into modules. A module
    // is the unit the learner reasons about — it has its own objective, its own
    // progress, and it is what `mastery_revise` operates on — and a single
    // ruled list made a ten-module outline read as one undifferentiated wall.
    <section
      id="mastery-outline-start"
      aria-label={t("Topic outline")}
      className="space-y-3 scroll-mt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
        <span>
          {t('{{modules}} modules · {{points}} knowledge points', {
            modules: topic.map.modules.length,
            points: topic.map.counts.total,
          })}
        </span>
        <button
          type="button"
          onClick={() => {
            if (allOpen) onSelect(null)
            setOpenModules(
              Object.fromEntries(topic.map.modules.map(module => [module.id, !allOpen]))
            )
          }}
          className="min-h-9 rounded-md px-2 font-medium hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {allOpen ? t('Collapse all modules') : t('Expand all modules')}
        </button>
      </div>
      {topic.map.modules.map((module, moduleIndex) => {
        const open = isOpen(module)
        const contentId = `mastery-module-${module.id}`
        return (
        <div
          key={module.id}
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
          <h3>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={contentId}
                onClick={() => {
                  if (open && module.knowledge_points.some(point => point.id === selectedId))
                    onSelect(null)
                  setOpenModules(current => ({ ...current, [module.id]: !open }))
                }}
                className="flex min-h-14 w-full items-center gap-3 bg-[var(--secondary)] px-4 py-3 text-left transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-xs text-[var(--muted-foreground)]">
                  {t("Module {{n}}", { n: moduleIndex + 1 })}
                </span>{' '}
                    {module.name.trim() !== topicName.trim() && (
                  <span className="break-words text-sm font-semibold text-[var(--foreground)]">
                    {module.name}
                  </span>
                )}
                </span>
                  {module.objective.trim() && (
                    <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">
                      {module.objective}
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]"
                  aria-label={t('{{mastered}} of {{total}} mastered', {
                    mastered: module.mastered,
                    total: module.total,
                  })}
                >
                  {module.mastered}/{module.total}
                </span>
              <ChevronRight
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
                />
              </button>
            </h3>
            <ul id={contentId} hidden={!open} className="divide-y divide-[var(--border)]">
              {module.knowledge_points.map((point) => {
                const selected = point.id === selectedId;
                const current = point.id === nextId
                const detailId = `mastery-point-${point.id}`
                return (
                  <li key={point.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(selected ? null : point.id)}
                      aria-expanded={selected}
                      aria-controls={detailId}
                      aria-current={current ? 'step' : undefined}
                      className={`flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${selected
                          ? "bg-[var(--muted)]"
                          : "hover:bg-[var(--muted)]/60"
                      }`}
                    >
                      <span className="pt-0.5">
                      <StatusMark point={point} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                        className={`block break-words text-[13px] leading-5 ${point.status === "new"
                            ? "text-[var(--muted-foreground)]"
                            : "text-[var(--foreground)]"
                        }`}
                      >
                        {point.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-4">
                          {current && (
                        <span className="font-medium text-[var(--primary)]">{t("Next")}</span>
                      )}
                      <span className="text-[var(--muted-foreground)]">
                        {statusLabel(point, t)}
                      </span>
                      </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className={`mt-1 h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform motion-reduce:transition-none ${selected ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                    <div id={detailId} hidden={!selected}>
                    {selected && (
                      <ObjectiveDrawer
                        key={point.id}
                        pathId={topic.path_id}
                        objectiveId={point.id}
                          revision={revision}
                          zh={zh}
                        studyHref={masterySectionRoute({ pathId: topic.path_id, sectionId: point.id, courseId: "", sessions })}
                        studyLabel={point.status === "new" ? t("Start learning") : t("Continue learning")}
                          onClose={() => onSelect(null)}
                        onOverride={onOverride}
                      />
                    )}
                  </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      })}
    </section>
  );
}

function ObjectiveDrawer({
  pathId,
  objectiveId,
  revision,
  zh,
  onClose,
  onOverride,
  studyHref,
  studyLabel,
}: {
  pathId: string;
  objectiveId: string;
  revision: number;
  zh: boolean;
  onClose: () => void;
  onOverride: (
    objectiveId: string,
    mastered: boolean,
    note: string,
  ) => Promise<void>
  studyHref: string
  studyLabel: string
}) {
  const { t } = useTranslation();
  const [report, setReport] = useState<ObjectiveReport | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchObjectiveReport(pathId, objectiveId, { signal: controller.signal })
      .then(setReport)
      .catch(() => {
        if (!controller.signal.aborted)
          setError(t("Evidence could not be loaded"));
      });
    return () => controller.abort();
  }, [objectiveId, pathId, revision, t]);

  const applyOverride = async (mastered: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await onOverride(objectiveId, mastered, note);
      setNoteOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Update failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="border-t border-[var(--border)] bg-[var(--secondary)]/60 px-4 py-4 sm:pl-12">
      {!report ? (
        <div className="flex min-h-32 items-center justify-center text-[var(--muted-foreground)]">
          {error ? error : <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                <span>{knowledgeTypeLabel(report.type, t)}</span>
                {report.mastery_source === "learner" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted-foreground)]/10 px-2 py-0.5 text-[var(--muted-foreground)]">
                    <Sparkles className="h-3 w-3" />
                    {t("Confirmed by you")}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
            >
              {t("Collapse")}
            </button>
          </div>
          <ObjectiveDetail report={report} zh={zh} />
          <Link
            href={studyHref}
            className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-xl bg-[var(--primary)] px-3 text-xs font-medium text-[var(--primary-foreground)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {studyLabel}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>

          {!report.assessed_mastered && (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              {report.mastery_source === "learner" ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs leading-5 text-[var(--muted-foreground)]">
                    {t(
                      "Marked as known by you; assessed evidence is unchanged.",
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void applyOverride(false)}
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--accent)] disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Undo2 className="h-3.5 w-3.5" />
                    )}
                    {t("Return to assessment")}
                  </button>
                </div>
              ) : noteOpen ? (
                <div>
                  <label className="text-xs font-medium text-[var(--foreground)]">
                    {t("Optional: why are you skipping this?")}
                    <textarea
                      autoFocus
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={2}
                      maxLength={500}
                      className="mt-2 w-full resize-none rounded-xl border border-[var(--input)] bg-[var(--background)] p-3 text-xs outline-none focus:border-[var(--ring)]"
                    />
                  </label>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setNoteOpen(false)}
                      className="h-9 rounded-xl px-3 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                    >
                      {t("Cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyOverride(true)}
                      disabled={busy}
                      className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--primary)] px-3 text-xs font-medium text-[var(--primary-foreground)] disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("Confirm mastery")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNoteOpen(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--accent)]"
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                  {t("I already know this — advance")}
                </button>
              )}
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
