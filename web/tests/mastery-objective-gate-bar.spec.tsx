import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ObjectiveDetail } from "@/components/space/learning/ObjectiveDetail";
import { initI18n } from "@/i18n/init";
import type { ObjectiveReport } from "@/lib/learning-api";

initI18n("en");

function report(overrides: Partial<ObjectiveReport> = {}): ObjectiveReport {
  return {
    id: "kp1",
    name: "Why XOR matters",
    type: "concept",
    module_name: "Module 1",
    status: "learning",
    gate: "qualitative",
    mastered: false,
    assessed_mastered: false,
    mastery_source: "",
    override_note: "",
    // Quiz accuracy, which the qualitative gate never reads.
    mastery: 1,
    threshold: 1,
    attempts: [
      {
        question_id: "q1",
        prompt: "Why does XOR matter?",
        answer: "it is not linearly separable",
        is_correct: true,
        error_type: "",
        at: 1_700_000_000,
      },
    ],
    correct_count: 1,
    explanation: "",
    review: null,
    errors: [],
    ...overrides,
  };
}

describe("objective gate bar", () => {
  it("does not invent percentages for legacy qualitative feedback", () => {
    render(<ObjectiveDetail report={report({ explanation: "Good boundaries, but persistence needs work." })} zh={false} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.getByText("Feedback recorded; awaiting criteria assessment")).toBeTruthy();
    expect(screen.getByText("Not yet passed")).toBeTruthy();
  });

  it("shows actual rubric progress separately from mastery verification", () => {
    render(<ObjectiveDetail report={report({ qualitative_assessment: {
      assessed_at: 1_700_000_000,
      criteria: [
        { name: "Controller boundaries", status: "met", evidence: "Routes requests, no business rules." },
        { name: "Service boundaries", status: "met", evidence: "Coordinates the use case." },
        { name: "Domain boundaries", status: "met", evidence: "Enforces valid state changes." },
        { name: "Persistence boundaries", status: "needs_work", evidence: "Assigned order changes to persistence." },
      ],
    } })} zh={false} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByText("3 of 4 assessment criteria met")).toBeTruthy();
    expect(screen.getByText("Needs more work")).toBeTruthy();
    expect(screen.getByText("Mastery verification")).toBeTruthy();
    expect(screen.getByText("Not yet passed")).toBeTruthy();
  });

  it("does not treat self-marking as assessed mastery", () => {
    render(<ObjectiveDetail report={report({ mastered: true, mastery_source: "learner" })} zh={false} />);
    expect(screen.getByText("Self-marked; not yet verified")).toBeTruthy();
    expect(screen.queryByText("100%")).toBeNull();
  });

  it("fills the bar once the qualitative gate actually opens", () => {
    render(
      <ObjectiveDetail
        report={report({
          mastered: true,
          assessed_mastered: true,
          status: "mastered",
          mastery_source: "system",
        })}
        zh={false}
      />,
    );

    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("Mastery verified")).toBeTruthy();
  });

  it("still reports real progress against a quantitative gate", () => {
    render(
      <ObjectiveDetail
        report={report({
          type: "memory",
          gate: "quantitative",
          mastery: 0.5,
          threshold: 0.9,
        })}
        zh={false}
      />,
    );

    expect(screen.getByText("50%")).toBeTruthy();
    expect(
      screen.queryByText(/Practice questions do not open this gate/),
    ).toBeNull();
  });
});
