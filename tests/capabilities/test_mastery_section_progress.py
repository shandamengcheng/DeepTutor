"""Section conversations resume from durable evidence, even in a new chat."""

import pytest

from deeptutor.agents.loop.pipeline import AgenticLoopPipeline
from deeptutor.capabilities.mastery.pipeline import MasteryLoopPipeline, MasteryPromptAssembler
from deeptutor.core.context import UnifiedContext
from deeptutor.learning.models import (
    AssessmentCriterion,
    KnowledgePoint,
    KnowledgeType,
    LearningEvidence,
    LearningModule,
    LearningProgress,
)
from deeptutor.learning.storage import LearningStore


@pytest.mark.asyncio
async def test_section_prompt_refreshes_persisted_feedback(monkeypatch, tmp_path):
    original_init = LearningStore.__init__
    monkeypatch.setattr(LearningStore, "__init__", lambda self: original_init(self, tmp_path))
    store = LearningStore()
    progress = LearningProgress(
        book_id="backend",
        modules=[
            LearningModule(
                id="basics",
                name="Basics",
                order=0,
                knowledge_points=[
                    KnowledgePoint(
                        id="layers",
                        name="Layer boundaries",
                        module_id="basics",
                        type=KnowledgeType.DESIGN,
                    )
                ],
            )
        ],
        feynman_explanations={"layers": "Move state transitions into the domain model."},
        qualitative_mastery={"layers": False},
        learning_evidence=[
            LearningEvidence(
                knowledge_point_id="layers",
                assessment_type="qualitative",
                result="partial",
                criteria=[
                    AssessmentCriterion(
                        name="Domain invariants",
                        status="needs_work",
                        evidence="State changes are still delegated to persistence.",
                    )
                ],
            )
        ],
    )
    store.save(progress)
    context = UnifiedContext(
        metadata={
            "mastery_path_id": "backend",
            "mastery_section_id": "layers",
            "mastery_section_report": {"explanation": "stale feedback"},
        }
    )

    async def capture_prompt(self, context, stream):
        blocks = MasteryPromptAssembler(prompts={}, language="en").foundation_blocks(context)
        return {"prompt": next(b.content for b in blocks if b.name == "mastery_section_progress")}

    monkeypatch.setattr(AgenticLoopPipeline, "run", capture_prompt)
    pipeline = MasteryLoopPipeline(language="en")
    result = await pipeline.run(context, None)
    assert progress.feynman_explanations["layers"] in result["prompt"]
    assert '"assessed_mastered": false' in result["prompt"]
    assert "stale feedback" not in result["prompt"]
    assert '"status": "needs_work"' in result["prompt"]
    assert "State changes are still delegated to persistence." in result["prompt"]
    assert '"evidence_count": 1' in result["prompt"]

    progress.feynman_explanations["layers"] = "Now separates orchestration and domain invariants."
    store.save(progress)
    result = await pipeline.run(context, None)
    assert progress.feynman_explanations["layers"] in result["prompt"]
    assert "Move state transitions" not in result["prompt"]
