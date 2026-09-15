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
  color?: string
  yAxisIndex: number
  data: (number | null)[]
}

describe('buildChartOption', () => {
  it('maps each series to the correct ECharts series type', () => {
    const option = buildChartOption(sampleData)
    const series = option.series as unknown as TestSeries[]

    expect(series).toHaveLength(4)

    expect(series[0].type).toBe('line')
    expect(series[0].areaStyle).toBeDefined()

    expect(series[1].type).toBe('bar')

    expect(series[2].type).toBe('line')
    expect(series[2].smooth).toBe(true)

    expect(series[3].type).toBe('line')
    expect(series[3].symbol).toBe('rect')
  })

  it('assigns each series its own color, matching the DTO', () => {
    const option = buildChartOption(sampleData)
    const series = option.series as unknown as TestSeries[]

    expect(series.map((s) => s.color)).toEqual([
      '#F5E1A4',
      '#5B8DEF',
      '#1B5E20',
      '#B026C7',
    ])
  })

  it('gives every series its own y-axis for independent scaling', () => {
    const option = buildChartOption(sampleData)
    const yAxis = option.yAxis as unknown[]
    const series = option.series as unknown as TestSeries[]

    expect(yAxis).toHaveLength(4)
    expect(new Set(series.map((s) => s.yAxisIndex)).size).toBe(4)
  })

  it('uses the response dates as the shared x-axis category data', () => {
    const option = buildChartOption(sampleData)
    const xAxis = option.xAxis as { data?: string[] }

    expect(xAxis.data).toEqual(sampleData.dates)
  })

  it('passes each series values through unchanged, including nulls', () => {
    const withGap: ChartDataResponseDto = {
      ...sampleData,
      series: sampleData.series.map((s, i) =>
        i === 0 ? { ...s, values: [null, 25.85] } : s,
      ),
    }

    const option = buildChartOption(withGap)
    const series = option.series as unknown as TestSeries[]

    expect(series[0].data).toEqual([null, 25.85])
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
