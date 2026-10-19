import { masterySessionRoute, masterySessionsRoute } from './learning-routes';

export interface MasteryDraftRouteGuard {
  routeKey: string;
  previousSessionId: string | null;
}

export interface MasterySectionSession {
  session_id: string;
  mastery_section_id?: string;
  archived?: boolean;
}

/** Route one outline section to its own durable conversation. */
export function masterySectionRoute({
  pathId,
  sectionId,
  courseId,
  sessions,
}: {
  pathId: string;
  sectionId: string;
  courseId: string;
  /** Most-recent first, matching the topic-sessions API. */
  sessions: readonly MasterySectionSession[];
}): string {
  const cleanSectionId = sectionId.trim();
  const existing = sessions.find(
    (session) => !session.archived && session.mastery_section_id === cleanSectionId,
  );
  const base = existing
    ? masterySessionRoute(pathId, existing.session_id)
    : masterySessionsRoute(pathId);
  const query = [
    cleanSectionId ? `section=${encodeURIComponent(cleanSectionId)}` : "",
    courseId.trim() ? `course=${encodeURIComponent(courseId.trim())}` : "",
  ].filter(Boolean);
  const suffix = query.join("&");
  return suffix ? `${base}${base.includes('?') ? '&' : '?'}${suffix}` : base;
}

/**
 * A draft route starts while UnifiedChatContext may still expose the session
 * that was visible on the previous page. Only promote the URL after the
 * backend has bound a different session to this draft.
 */
export function isMasteryDraftSessionReady({
  guard,
  routeKey,
  sessionId,
  masteryPathId,
  pathId,
}: {
  guard: MasteryDraftRouteGuard | null;
  routeKey: string;
  sessionId: string | null;
  masteryPathId: string | null;
  pathId: string;
}): boolean {
  return Boolean(
    guard &&
    guard.routeKey === routeKey &&
    sessionId &&
    sessionId !== guard.previousSessionId &&
    masteryPathId === pathId,
  );
}

/** Sending the first turn requires a committed local draft, not a server ID. */
export function isMasteryDraftSendReady(input: {
  binding: { routeKey: string; draftKey: string } | null;
  routeKey: string;
  sessionKey: string;
  workspaceMode: string | null;
  masteryPathId: string | null;
  pathId: string;
  masterySessionMode: string | null;
  requestedMode: string;
}): boolean {
  return Boolean(
    input.binding &&
    input.binding.routeKey === input.routeKey &&
    input.binding.draftKey === input.sessionKey &&
    input.workspaceMode === "mastery_path" &&
    input.masteryPathId === input.pathId &&
    input.masterySessionMode === input.requestedMode,
  );
}
