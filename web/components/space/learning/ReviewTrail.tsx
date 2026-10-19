"use client";

import Tooltip from "@/shared/ui/Tooltip";
import { CheckCircle2, Clock3, Loader2, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";

import type { TopicReview } from "@/lib/learning-api";

import { formatRelative } from "./format";

const RETENTION_TARGETS = [0.7, 0.8, 0.85, 0.9, 0.95, 0.97, 0.99];

export function ReviewTrail({
  reviews,
  desiredRetention,
  retentionBusy,
  retentionError,
  onRetentionChange,
  zh,
  onSelect,
  onStartReview,
}: {
  reviews: TopicReview[];
  desiredRetention: number;
  retentionBusy: boolean;
  retentionError: string | null;
  onRetentionChange: (value: number) => void;
  zh: boolean;
  onSelect: (objectiveId: string) => void;
  onStartReview: (objectiveId: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const due = reviews.filter((review) => review.due);
  const ordered = [...reviews].sort(
    (left, right) =>
      Number(right.due) - Number(left.due) ||
      (left.due
        ? right.forgetting_risk - left.forgetting_risk
        : left.due_at - right.due_at),
  );
  const visible = expanded ? ordered : ordered.slice(0, 5);
  const retentionTargets = RETENTION_TARGETS.includes(desiredRetention)
    ? RETENTION_TARGETS
    : [...RETENTION_TARGETS, desiredRetention].sort((a, b) => a - b);
  return (
    <section
      id="mastery-review-plan"
      className="scroll-mt-6 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--secondary)] px-4 py-2.5">
        <Tooltip label={t("Scheduled by your forgetting curve")} as="div" side="top">
          <h2 tabIndex={0} className="text-[12px] font-semibold text-[var(--foreground)]">
            {t("Review plan")}
          </h2>
        </Tooltip>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
            <span>{t("Recall target")}</span>
            <select
              value={desiredRetention}
              onChange={(event) => onRetentionChange(Number(event.target.value))}
              disabled={retentionBusy}
              aria-describedby="review-retention-hint"
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 text-[11px] font-medium tabular-nums text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 disabled:opacity-60"
            >
              {retentionTargets.map((target) => (
                <option key={target} value={target}>
                  {Math.round(target * 1000) / 10}%
                </option>
              ))}
            </select>
          </label>
          {retentionBusy && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              <span className="sr-only">{t("Saving…")}</span>
            </span>
          )}
          <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
            {due.length} {t("due")}
          </span>
        </div>
      </div>
      <p id="review-retention-hint" className="shrink-0 px-4 pt-2 text-[10px] text-[var(--muted-foreground)]">
        {t("Higher targets schedule reviews sooner.")}
      </p>
      {retentionError && (
        <p role="alert" className="px-4 pt-1 text-[11px] text-red-600 dark:text-red-400">
          {retentionError}
        </p>
      )}
      {reviews.length === 0 ? (
        <div className="flex items-start gap-2 px-4 py-3.5 text-[12px] leading-5 text-[var(--muted-foreground)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
          {t(
            "Nothing is due today. Keep going — reviews will resurface at the right time.",
          )}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] px-4">
          {visible.map((review) => (
            <div
              key={review.id}
              className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <button
                type="button"
                onClick={() => onSelect(review.knowledge_point_id)}
                  aria-label={t('View learning evidence for {{name}}', {
                    name: review.knowledge_point_name,
                  })}
                  className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                <span className="block break-words text-[13px] font-medium leading-5 text-[var(--foreground)]">
                  {review.knowledge_point_name}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-[var(--muted-foreground)]">
                    <span
                      className={`inline-flex items-center gap-1 ${review.due ? 'font-medium text-[var(--primary)]' : ''}`}
                    >
                      <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                  {review.due
                    ? t("Ready now")
                    : formatRelative(review.due_at, zh)}
                  </span>
                    <span>
                      {t("risk {{risk}}%", { risk: Math.round(review.forgetting_risk * 100) })}
                    </span>
                  {review.recent_failure && (
                    <span className="text-red-600 dark:text-red-400">{t("recent failure")}</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                aria-label={t("Start review for {{name}}", { name: review.knowledge_point_name })}
                onClick={() => onStartReview(review.knowledge_point_id, review.knowledge_point_name)}
                className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${review.due ? 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90' : 'border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
                >
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
                  {t('Start review')}
                </button>
              </div>
              {review.reason && (
                <details className="mt-2 text-[11px] leading-5 text-[var(--muted-foreground)]">
                  <summary className="w-fit cursor-pointer rounded py-1 underline-offset-4 hover:text-[var(--foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                    {t('Review rationale')}
                  </summary>
                  <p className="mt-1 break-words">{review.reason}</p>
                </details>
              )}
            </div>
          ))}
          {reviews.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 w-full rounded-md px-2.5 py-2 text-left text-[11px] font-medium text-[var(--primary)] hover:bg-[var(--muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40"
            >
              {expanded ? t("Show fewer") : t("Show all {{count}} reviews", { count: reviews.length })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
