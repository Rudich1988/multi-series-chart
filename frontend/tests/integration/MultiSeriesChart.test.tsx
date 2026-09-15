import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MultiSeriesChart } from '../../src/components/MultiSeriesChart/MultiSeriesChart'

vi.mock('echarts', () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn() })),
}))

// Mocks the network boundary (fetch), not chartApi itself, so these tests exercise the real
// snake_case -> camelCase mapping in chartApi.ts too (a real bug: the backend returns
// `chart_type`/`roi_threshold.above_color`, and an earlier version of chartApi.ts just
// type-cast the raw JSON instead of mapping it, so the chart silently rendered nothing).
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response)
}

describe('MultiSeriesChart', () => {
  it('shows a loading indicator while the request is in flight', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<MultiSeriesChart />)

    expect(screen.getByText(/loading/i)).toBeDefined()
  })

  it('shows an error state when the request fails', async () => {
    fetchMock.mockReturnValue(jsonResponse({}, false))

    render(<MultiSeriesChart />)

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeDefined()
    })
  })

  it('renders the chart container on success, mapping the real (snake_case) response shape', async () => {
    fetchMock.mockReturnValue(
      jsonResponse({
        dates: ['2026-06-10'],
        series: [
          {
            key: 'cost',
            name: 'Cost',
            chart_type: 'area',
            color: '#F5E1A4',
            decimals: 2,
            values: [2.04],
          },
        ],
        roi_threshold: {
          value: 150,
          above_color: '#1B5E20',
          at_or_below_color: '#8BC34A',
        },
      }),
    )

    const { container } = render(<MultiSeriesChart />)

    await waitFor(() => {
      expect(container.querySelector('.multi-series-chart')).not.toBeNull()
    })
    expect(screen.queryByText(/loading/i)).toBeNull()
    expect(screen.queryByText(/failed to load/i)).toBeNull()
  })
})
