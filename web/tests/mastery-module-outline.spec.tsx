import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ModuleOutline } from '@/components/space/learning/ModuleOutline'
import { fetchObjectiveReport, type MasteryTopic, type ObjectiveReport } from '@/lib/learning-api'
import { initI18n } from '@/i18n/init'

initI18n('en')
vi.mock('@/lib/learning-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/learning-api')>()),
  fetchObjectiveReport: vi.fn(() => new Promise(() => {})),
}))

function topic(): MasteryTopic {
  return {
    path_id: 'path',
    name: 'Backend',
    metadata: {
      path_id: 'path',
      goal: '',
      description: '',
      emoji: '',
      map_seed: 0,
      status: 'active',
      created_at: 0,
      updated_at: 0,
    },
    sources: [],
    path_revision: 1,
    reviews: [],
    learner_profile: null,
    session_count: 0,
    updated_at: 0,
    next: {
      action: 'assess',
      knowledge_point_id: 'kp1',
      knowledge_point_name: 'Layer boundaries',
      knowledge_point_type: 'design',
      status: 'learning',
      gate: 'qualitative',
      mastery: 0,
      threshold: 1,
      reason: '',
      forgetting_risk: 0,
      session_id: '',
      pending_prompt: '',
    },
    map: {
      name: 'Backend',
      counts: { mastered: 0, learning: 1, new: 1, total: 2 },
      due_reviews: 0,
      complete: false,
      modules: ['Basics', 'Storage'].map((name, index) => ({
        id: `m${index}`,
        name,
        objective: '',
        order: index,
        mastered: 0,
        total: 1,
        knowledge_points: [
          {
            id: `kp${index + 1}`,
            name: index ? 'Database boundaries' : 'Layer boundaries',
            type: 'design',
            prerequisite_ids: [],
            topic_source_ids: [],
            status: index ? 'new' : 'learning',
            mastery: 0,
            mastery_source: '',
            override_note: '',
          },
        ],
      })),
    },
  }
}

function Outline({ sessions = [] }: { sessions?: MasteryTopicSession[] } = {}) {
  const [selectedId, onSelect] = useState<string | null>(null)
  return (
    <ModuleOutline
      topic={topic()}
      revision={1}
      selectedId={selectedId}
      zh={false}
      onSelect={onSelect}
      onOverride={async () => {}}
      sessions={sessions}
    />
  )
}

type MasteryTopicSession = NonNullable<Parameters<typeof ModuleOutline>[0]['sessions']>[number]

const report: ObjectiveReport = {
  id: 'kp1', name: 'Layer boundaries', type: 'design', module_name: 'Basics',
  status: 'learning', gate: 'qualitative', mastered: false, assessed_mastered: false,
  mastery_source: '', override_note: '', mastery: 0, threshold: 1,
  attempts: [], correct_count: 0, explanation: 'Keep state changes in the domain model.',
  review: null, errors: [],
}

describe('module outline navigation', () => {
  it('opens the matching conversation when continuing a learning point', async () => {
    vi.mocked(fetchObjectiveReport).mockResolvedValueOnce(report)
    render(<Outline sessions={[{ session_id: 'layer-chat', mastery_section_id: 'kp1' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Layer boundaries/ }))
    expect(await screen.findByRole('link', { name: 'Continue learning' })).toHaveAttribute(
      'href', '/learning/mastery/path/sessions/layer-chat?section=kp1'
    )
    expect(screen.getByText(report.explanation)).toBeVisible()
  })

  it('starts an unvisited point in its own section rather than the global next point', async () => {
    vi.mocked(fetchObjectiveReport).mockResolvedValueOnce({ ...report, id: 'kp2', status: 'new', explanation: '' })
    render(<Outline />)
    fireEvent.click(screen.getByRole('button', { name: /Database boundaries/ }))
    expect(await screen.findByRole('link', { name: 'Start learning' })).toHaveAttribute(
      'href', '/learning/mastery/path/sessions?section=kp2'
    )
  })
})
