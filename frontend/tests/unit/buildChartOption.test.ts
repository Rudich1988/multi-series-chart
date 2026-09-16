import { describe, expect, it } from 'vitest'
import { buildChartOption } from '../../src/components/MultiSeriesChart/buildChartOption'
import type { ChartDataResponseDto } from '../../src/types/chart'

const sampleData: ChartDataResponseDto = {
  dates: ['2026-06-10', '2026-06-11'],
  series: [
    {
      key: 'cost',
      name: 'Cost',
      chartType: 'area',
      color: '#F5E1A4',
      decimals: 2,
      values: [2.04, 25.85],
    },
    {
      key: 'cpa',
      name: 'CPA',
      chartType: 'bar',
      color: '#5B8DEF',
      decimals: 2,
      values: [0.68, 0.86],
    },
    {
      key: 'roi_confirmed',
      name: 'ROI confirmed',
      chartType: 'spline',
      color: '#1B5E20',
      decimals: 2,
      values: [610.78, 180.5],
    },
    {
      key: 'conversions',
      name: 'Conversions',
      chartType: 'line',
      color: '#B026C7',
      decimals: 0,
      values: [3, 30],
    },
  ],
  roiThreshold: {
    value: 150,
    aboveColor: '#1B5E20',
    atOrBelowColor: '#8BC34A',
  },
}

interface TestSeries {
  type: string
  areaStyle?: unknown
  smooth?: boolean
  symbol?: string
  symbolSize?: number
  color?: string
  barWidth?: string
  lineStyle?: { width?: number; opacity?: number }
  itemStyle?: { opacity?: number }
  yAxisIndex: number
  data: (number | null)[]
  z?: number
  emphasis?: {
    itemStyle?: {
      color?: string
      borderColor?: string
      borderWidth?: number
      shadowColor?: string
    }
    lineStyle?: { width?: number }
  }
}

// Real series (one per DTO entry, in order) come first in `option.series`; halo companion
// series (see `buildHaloSeries`) are appended after, one per non-bar real series.
const REAL_SERIES_COUNT = sampleData.series.length

function realSeries(option: ReturnType<typeof buildChartOption>): TestSeries[] {
  return (option.series as unknown as TestSeries[]).slice(0, REAL_SERIES_COUNT)
}

describe('buildChartOption', () => {
  it('maps each real series to the correct ECharts series type and marker shape', () => {
    const option = buildChartOption(sampleData)
    const series = realSeries(option)

    expect(series).toHaveLength(4)

    expect(series[0].type).toBe('line')
    expect(series[0].areaStyle).toBeDefined()
    expect(series[0].symbol).toBe('circle')

    expect(series[1].type).toBe('bar')
    expect(series[1].barWidth).toBe('25%')

    expect(series[2].type).toBe('line')
    expect(series[2].smooth).toBe(true)
    expect(series[2].symbol).toBe('diamond')

    expect(series[3].type).toBe('line')
    expect(series[3].symbol).toBe('rect')
  })

  it('assigns each real series its own color, matching the DTO', () => {
    const option = buildChartOption(sampleData)
    const series = realSeries(option)

    expect(series.map((s) => s.color)).toEqual([
      '#F5E1A4',
      '#5B8DEF',
      '#1B5E20',
      '#B026C7',
    ])
  })

  it('gives every real series its own y-axis for independent scaling', () => {
    const option = buildChartOption(sampleData)
    const yAxis = option.yAxis as unknown[]
    const series = realSeries(option)

    expect(yAxis).toHaveLength(4)
    expect(new Set(series.map((s) => s.yAxisIndex)).size).toBe(4)
  })

  it('uses the response dates as the shared x-axis category data', () => {
    const option = buildChartOption(sampleData)
    const xAxis = option.xAxis as { data?: string[] }

    expect(xAxis.data).toEqual(sampleData.dates)
  })

  it('passes each real series values through unchanged, including nulls', () => {
    const withGap: ChartDataResponseDto = {
      ...sampleData,
      series: sampleData.series.map((s, i) =>
        i === 0 ? { ...s, values: [null, 25.85] } : s,
      ),
    }

    const option = buildChartOption(withGap)
    const series = realSeries(option)

    expect(series[0].data).toEqual([null, 25.85])
  })

  it('turns the hovered point into a white-bordered, color-filled marker on area/spline/line', () => {
    const option = buildChartOption(sampleData)
    const [cost, , roi, conversions] = realSeries(option)

    for (const series of [cost, roi, conversions]) {
      expect(series.emphasis?.itemStyle?.color).toBe(series.color)
      expect(series.emphasis?.itemStyle?.borderColor).toBe('#fff')
    }
  })

  it('adds one invisible-until-hovered circular halo series per non-bar series', () => {
    const option = buildChartOption(sampleData)
    const allSeries = option.series as unknown as TestSeries[]
    const haloSeries = allSeries.slice(REAL_SERIES_COUNT)

    // cost, roi_confirmed, conversions get a halo; cpa (bar) doesn't.
    const expectedColors = sampleData.series
      .filter((s) => s.chartType !== 'bar')
      .map((s) => s.color)

    expect(haloSeries).toHaveLength(3)
    haloSeries.forEach((halo, i) => {
      expect(halo.symbol).toBe('circle')
      expect(halo.itemStyle).toEqual(expect.objectContaining({ opacity: 0 }))
      expect(halo.emphasis?.itemStyle?.color).toBe(expectedColors[i])
    })
  })

  it('stacks each real marker above its own halo (z-order), so the halo cannot tint it', () => {
    const option = buildChartOption(sampleData)
    const allSeries = option.series as unknown as TestSeries[]
    const [cost, , roi, conversions] = realSeries(option)
    const haloSeries = allSeries.slice(REAL_SERIES_COUNT)

    for (const marker of [cost, roi, conversions]) {
      for (const halo of haloSeries) {
        expect(marker.z ?? 0).toBeGreaterThan(halo.z ?? 0)
      }
    }
  })

  it('makes the ROI confirmed line thinner on hover than at rest', () => {
    const option = buildChartOption(sampleData)
    const [, , roi] = realSeries(option)

    expect(roi.lineStyle?.width).toBeGreaterThan(
      roi.emphasis?.lineStyle?.width ?? Infinity,
    )
  })
})

interface TestVisualMapPiece {
  color?: string
  lte?: number
  gt?: number
}

interface TestVisualMap {
  type?: string
  seriesIndex?: number
  show?: boolean
  pieces?: TestVisualMapPiece[]
}

describe('buildChartOption — ROI confirmed threshold color split (visualMap)', () => {
  const roiIndex = sampleData.series.findIndex((s) => s.key === 'roi_confirmed')

  it('targets the roi_confirmed series with a piecewise visualMap', () => {
    const option = buildChartOption(sampleData)
    const visualMap = option.visualMap as TestVisualMap

    expect(visualMap.type).toBe('piecewise')
    expect(visualMap.seriesIndex).toBe(roiIndex)
  })

  it('produces exactly two flat colors, taken from roiThreshold', () => {
    const option = buildChartOption(sampleData)
    const visualMap = option.visualMap as TestVisualMap

    expect(visualMap.pieces).toHaveLength(2)
    expect(visualMap.pieces?.map((p) => p.color).sort()).toEqual(
      [
        sampleData.roiThreshold.aboveColor,
        sampleData.roiThreshold.atOrBelowColor,
      ].sort(),
    )
  })

  it('places the boundary at roiThreshold.value, counting the threshold itself as at/below', () => {
    const option = buildChartOption(sampleData)
    const visualMap = option.visualMap as TestVisualMap

    const atOrBelowPiece = visualMap.pieces?.find(
      (p) => p.color === sampleData.roiThreshold.atOrBelowColor,
    )
    const abovePiece = visualMap.pieces?.find(
      (p) => p.color === sampleData.roiThreshold.aboveColor,
    )

    // `lte` (not `lt`/`max`) is the point: a value exactly on the threshold must render as
    // at/below, per spec Edge Cases ("exactly on the threshold counts as at/below").
    expect(atOrBelowPiece?.lte).toBe(sampleData.roiThreshold.value)
    expect(abovePiece?.gt).toBe(sampleData.roiThreshold.value)
  })
})
