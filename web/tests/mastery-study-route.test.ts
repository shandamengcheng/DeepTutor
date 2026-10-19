import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  isMasteryDraftSessionReady,
  masterySectionRoute,
} from "../lib/mastery-study-route";

const base = {
  guard: {
    routeKey: "topic-a:new",
    previousSessionId: "session-old",
  },
  routeKey: "topic-a:new",
  masteryPathId: "topic-a",
  pathId: "topic-a",
};

test("a stale previous session cannot bounce a new-study route backwards", () => {
  assert.equal(
    isMasteryDraftSessionReady({ ...base, sessionId: "session-old" }),
    false,
  );
});

test("the backend-bound draft session is promoted into the route", () => {
  assert.equal(
    isMasteryDraftSessionReady({ ...base, sessionId: "session-new" }),
    true,
  );
});

test("a route or topic switch invalidates an older draft guard", () => {
  assert.equal(
    isMasteryDraftSessionReady({
      ...base,
      routeKey: "topic-b:new",
      sessionId: "session-new",
    }),
    false,
  );
  assert.equal(
    isMasteryDraftSessionReady({
      ...base,
      masteryPathId: "topic-b",
      sessionId: "session-new",
    }),
    false,
  );
});

test("an unbound draft stays on the sessionless study route", () => {
  assert.equal(isMasteryDraftSessionReady({ ...base, sessionId: null }), false);
});

test("entering a new section opens a fresh conversation", () => {
  assert.equal(
    masterySectionRoute({
      pathId: "backend/expert",
      sectionId: "http-and-dns",
      courseId: "course backend",
      sessions: [
        {
          session_id: "operating-system-chat",
          mastery_section_id: "processes-and-threads",
        },
      ],
    }),
    "/learning/mastery/backend%2Fexpert/sessions?section=http-and-dns&course=course%20backend",
  );
});

test("returning to a section restores that section's latest conversation", () => {
  assert.equal(
    masterySectionRoute({
      pathId: "backend",
      sectionId: "http",
      courseId: "",
      sessions: [
        { session_id: "older", mastery_section_id: "http" },
        { session_id: "newer", mastery_section_id: "http" },
      ],
    }),
    "/learning/mastery/backend/sessions/older?section=http",
  );
});

test("legacy /mastery/.../study URLs permanently redirect to /sessions", async () => {
  const nextConfig = require(path.resolve(process.cwd(), "next.config.js")) as {
    redirects?: () => Promise<
      Array<{ source: string; destination: string; statusCode: number }>
    >;
  };
  assert.equal(typeof nextConfig.redirects, "function");
  const redirects = await nextConfig.redirects!();
  assert.deepEqual(
    redirects.filter((entry) => entry.source.includes("/study")),
    [
      {
        source: "/mastery/:pathId/study",
        destination: "/learning/mastery/:pathId/sessions",
        statusCode: 301,
      },
      {
        source: "/mastery/:pathId/study/:sessionId",
        destination: "/learning/mastery/:pathId/sessions/:sessionId",
        statusCode: 301,
      },
    ],
  );
});


test("archived section conversations are not offered when resuming learning", () => {
  for (const active of [[], [{ session_id: "active", mastery_section_id: "http" }]]) {
    const route = masterySectionRoute({
      pathId: "backend", sectionId: "http", courseId: "",
      sessions: [{ session_id: "archived", mastery_section_id: "http", archived: true }, ...active],
    });
    assert.equal(route, active.length
      ? "/learning/mastery/backend/sessions/active?section=http"
      : "/learning/mastery/backend/sessions?section=http");
  }
});
