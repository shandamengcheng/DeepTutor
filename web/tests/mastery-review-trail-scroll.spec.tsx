import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReviewTrail } from '@/components/space/learning/ReviewTrail'
import type { TopicReview } from '@/lib/learning-api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(opts[name])) : key,
    i18n: { language: 'en' },
  }),
}))

function makeReviews(count: number): TopicReview[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `review-${index + 1}`,
    knowledge_point_id: `kp-${index + 1}`,
    knowledge_point_name: `KP ${index + 1}`,
    knowledge_type: 'concept',
    due_at: 1000 + index,
    priority: 1,
    due: true,
    forgetting_risk: 0.5,
    reason: 'scheduled',
    stability: 1,
    retrievability: 0.9,
    desired_retention: 0.9,
    lapse_count: 0,
    recent_failure: false,
  }))
}

function renderTrail(reviews: TopicReview[]) {
  return render(
    <ReviewTrail
      reviews={reviews}
      desiredRetention={0.9}
      retentionBusy={false}
      retentionError={null}
      onRetentionChange={vi.fn()}
      zh={false}
      onSelect={vi.fn()}
      onStartReview={vi.fn()}
    />
  )
}

describe('ReviewTrail interactions', () => {
  it('keeps all reviews reachable through explicit expansion', () => {
    renderTrail(makeReviews(7))
    expect(screen.getByText('7 due')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Start review for/ })).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7 reviews' }))
    expect(screen.getAllByRole('button', { name: /^Start review for/ })).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', {
        name: 'Show fewer' }))
    expect(screen.getAllByRole('button', { name: /^Start review for/ })).toHaveLength(5)
  })

  it('separates viewing evidence from starting a review', () => {
    const onSelect = vi.fn()
    const onStartReview = vi.fn()
    render(
      <ReviewTrail
        reviews={makeReviews(1)}
        desiredRetention={0.9}
        retentionBusy={false}
        retentionError={null}
        onRetentionChange={vi.fn()}
        zh={false}
        onSelect={onSelect}
        onStartReview={onStartReview}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'View learning evidence for KP 1' }))
    expect(onSelect).toHaveBeenCalledWith('kp-1')
    expect(onStartReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start review for KP 1' }))
    expect(onStartReview).toHaveBeenCalledWith('kp-1', 'KP 1')
    expect(screen.getByText('Review rationale').closest('details')).not.toHaveAttribute('open')
  })

  it('keeps the retention setting available and disables it while saving', () => {
    const onRetentionChange = vi.fn()
    const props = {
      reviews: [],
      desiredRetention: 0.9,
      retentionBusy: false,
      retentionError: null,
      onRetentionChange,
      zh: false,
      onSelect: vi.fn(),
      onStartReview: vi.fn(),
    }
    const view = render(<ReviewTrail {...props} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Recall target' }), {
      target: { value: '0.95' },
    })
      expect(onRetentionChange).toHaveBeenCalledWith(0.95)
    view.rerender(<ReviewTrail {...props} retentionBusy />)
    expect(screen.getByRole('combobox', { name: 'Recall target' })).toBeDisabled()
  })
})
