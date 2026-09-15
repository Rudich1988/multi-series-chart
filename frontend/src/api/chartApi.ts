import { config } from '../config'
import type {
  ChartDataResponseDto,
  ChartType,
  RoiThresholdDto,
  SeriesDto,
  SeriesKey,
} from '../types/chart'

interface RawSeries {
  key: SeriesKey
  name: string
  chart_type: ChartType
  color: string
  decimals: number
  values: (number | null)[]
}

interface RawRoiThreshold {
  value: number
  above_color: string
  at_or_below_color: string
}

interface RawChartDataResponse {
  dates: string[]
  series: RawSeries[]
  roi_threshold: RawRoiThreshold
}

function toSeriesDto(raw: RawSeries): SeriesDto {
  return {
    key: raw.key,
    name: raw.name,
    chartType: raw.chart_type,
    color: raw.color,
    decimals: raw.decimals,
    values: raw.values,
  }
}

function toRoiThresholdDto(raw: RawRoiThreshold): RoiThresholdDto {
  return {
    value: raw.value,
    aboveColor: raw.above_color,
    atOrBelowColor: raw.at_or_below_color,
  }
}

export async function fetchChartData(): Promise<ChartDataResponseDto> {
  const response = await fetch(`${config.apiBaseUrl}/chart-data`)

  if (!response.ok) {
    throw new Error(`Failed to fetch chart data: ${response.status}`)
  }

  const raw = (await response.json()) as RawChartDataResponse

  return {
    dates: raw.dates,
    series: raw.series.map(toSeriesDto),
    roiThreshold: toRoiThresholdDto(raw.roi_threshold),
  }
}
