import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MultiSeriesChart } from '../../src/components/MultiSeriesChart/MultiSeriesChart'

// Real mouse-driven canvas hover (halo pixels, tooltip DOM position) can't be exercised in jsdom
// without a real ECharts canvas renderer — same scope boundary as T030's integration test.
// Instead, this captures the exact `EChartsOption` the component hands to `echarts.setOption()`
// and drives its `tooltip.formatter` directly with fabricated axis-trigger params (the same shape
// ECharts itself would pass on hover), asserting the tooltip/halo *configuration* is correct.
// Real rendered hover behavior is covered by manual browser verification (see tasks.md T032-T035
// checkpoint note).
const setOptionMock = vi.fn()

vi.mock('echarts', () => ({
  init: vi.fn(() => ({ setOption: setOptionMock, dispose: vi.fn() })),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  setOptionMock.mockReset()
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response)
}

const sampleResponse = {
  dates: ['2026-06-11', '2026-06-12'],
  series: [
    {
      key: 'cost',
      name: 'Cost',
      chart_type: 'area',
      color: '#F5E1A4',
      decimals: 2,
      values: [25.85, 44.36],
    },
    {
      key: 'cpa',
      name: 'CPA',
      chart_type: 'bar',
      color: '#5B8DEF',
      decimals: 2,
      values: [0.86, null],
    },
    {
      key: 'roi_confirmed',
      name: 'ROI confirmed',
      chart_type: 'spline',
      color: '#1B5E20',
      decimals: 2,
      values: [180.5, 161.47],
    },
    {
      key: 'conversions',
      name: 'Conversions',
      chart_type: 'line',
      color: '#B026C7',
      decimals: 0,
      values: [30, 36],
    },
  ],
  roi_threshold: {
    value: 150,
    above_color: '#1B5E20',
    at_or_below_color: '#8BC34A',
  },
}

interface FakeOption {
  series: {
    color?: string
    symbol?: string
    itemStyle?: { opacity?: number }
    emphasis?: {
      itemStyle?: {
        color?: string
        borderColor?: string
        shadowColor?: string
      }
    }
  }[]
  tooltip: {
    confine?: boolean
    transitionDuration?: number
    formatter: (params: unknown) => string
  }
}

async function renderAndCaptureOption(): Promise<FakeOption> {
  fetchMock.mockReturnValue(jsonResponse(sampleResponse))
  render(<MultiSeriesChart />)
  await waitFor(() => expect(setOptionMock).toHaveBeenCalled())
  return setOptionMock.mock.calls[0][0] as FakeOption
}

function fakeAxisParams(dataIndex: number) {
  return sampleResponse.series.map((series, seriesIndex) => ({
    componentType: 'series',
    seriesIndex,
    seriesName: series.name,
    name: sampleResponse.dates[dataIndex],
    dataIndex,
    data: series.values[dataIndex],
    value: series.values[dataIndex],
    color: series.color,
  }))
}

describe('hover interaction (tooltip + halo configuration)', () => {
  it('renders a single tooltip listing all 4 series, colored and valued, for the hovered date', async () => {
    const option = await renderAndCaptureOption()

    const html = option.tooltip.formatter(fakeAxisParams(1))

    expect(html).toContain('12.06.2026')
    for (const series of sampleResponse.series) {
      expect(html).toContain(series.name)
      expect(html).toContain(series.color)
    }
    expect(html).toContain('44.36')
    expect(html).toContain('161.47')
    expect(html).toContain('36')
  })

  it('shows "no data" for a series with a null value at the hovered date', async () => {
    const option = await renderAndCaptureOption()

    const html = option.tooltip.formatter(fakeAxisParams(1))

    expect(html).toContain('no data')
  })

  it('turns the hovered point white-bordered, color-filled on area/spline/line and glows the bar', async () => {
    const option = await renderAndCaptureOption()
    const [cost, cpa, roi, conversions] = option.series

    for (const series of [cost, roi, conversions]) {
      expect(series.emphasis?.itemStyle?.color).toBe(series.color)
      expect(series.emphasis?.itemStyle?.borderColor).toBe('#fff')
    }
    expect(cpa.emphasis?.itemStyle?.shadowColor).toBe(cpa.color)
  })

  it('adds an invisible-until-hovered circular halo series for each non-bar series', async () => {
    const option = await renderAndCaptureOption()
    // 4 real series (cost, cpa, roi_confirmed, conversions) + 3 halo series (all but the bar).
    const haloSeries = option.series.slice(4)

    expect(option.series).toHaveLength(7)
    expect(haloSeries).toHaveLength(3)
    for (const halo of haloSeries) {
      expect(halo.symbol).toBe('circle')
      expect(halo.itemStyle?.opacity).toBe(0)
      expect(halo.emphasis?.itemStyle?.color).toBeTruthy()
    }
  })

  it('keeps the tooltip within the chart bounds and fades in well under 150ms', async () => {
    const option = await renderAndCaptureOption()

    expect(option.tooltip.confine).toBe(true)
    expect(option.tooltip.transitionDuration).toBeGreaterThan(0)
    expect(option.tooltip.transitionDuration).toBeLessThanOrEqual(0.15)
  })
})
