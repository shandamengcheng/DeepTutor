import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SectionCompletionDialog } from "@/components/space/learning/SectionCompletionDialog";
import { initI18n } from "@/i18n/init";
import type { MasteryTopic, ObjectiveStatus } from "@/lib/learning-api";

initI18n("en");
afterEach(cleanup);
function topic(status: ObjectiveStatus, path_id = "path"): Pick<MasteryTopic, "path_id" | "map"> {
  return {
    path_id,
    map: {
      name: "Course", counts: { mastered: 0, learning: 1, new: 0, total: 1 },
      due_reviews: 0, complete: false,
      modules: [{ id: "module", name: "Module", objective: "", order: 0, mastered: 0, total: 1,
        knowledge_points: [{ id: "point", name: "Fourier transform", type: "concept",
          prerequisite_ids: [], topic_source_ids: [], status, mastery: 1,
          mastery_source: "system", override_note: "" }] }],
    },
  };
}

describe("section completion", () => {
  it("celebrates a newly completed section and stays dismissed after refresh", () => {
    const view = render(<SectionCompletionDialog topic={topic("learning")} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<SectionCompletionDialog topic={topic("mastered")} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Fourier transform")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep learning" }));
    view.rerender(<SectionCompletionDialog topic={topic("mastered")} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not celebrate initial completed data or a different path", () => {
    const view = render(<SectionCompletionDialog topic={topic("mastered")} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<SectionCompletionDialog topic={topic("learning")} />);
    view.rerender(<SectionCompletionDialog topic={topic("mastered", "other")} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
