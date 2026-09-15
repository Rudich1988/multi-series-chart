export type SeriesKey = 'cost' | 'cpa' | 'roi_confirmed' | 'conversions'
export type ChartType = 'area' | 'bar' | 'spline' | 'line'

export interface SeriesDto {
  key: SeriesKey
  name: string
  chartType: ChartType
  color: string
  decimals: number
  values: (number | null)[]
}

export interface RoiThresholdDto {
  value: number
  aboveColor: string
  atOrBelowColor: string
}

export interface ChartDataResponseDto {
  dates: string[]
  series: SeriesDto[]
  roiThreshold: RoiThresholdDto
}
