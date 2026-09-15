import type { EChartsOption } from 'echarts'
import type {
  ChartDataResponseDto,
  ChartType,
  SeriesDto,
} from '../../types/chart'

function toEChartsSeries(series: SeriesDto, yAxisIndex: number) {
  const base = {
    name: series.name,
    yAxisIndex,
    data: series.values,
    color: series.color,
  }

  const byChartType: Record<ChartType, object> = {
    area: { ...base, type: 'line', areaStyle: {}, symbol: 'none' },
    bar: { ...base, type: 'bar' },
    spline: { ...base, type: 'line', smooth: true, symbol: 'none' },
    line: { ...base, type: 'line', symbol: 'rect', symbolSize: 8 },
  }

  return byChartType[series.chartType]
}

export function buildChartOption(data: ChartDataResponseDto): EChartsOption {
  return {
    grid: { left: 8, right: 8, top: 8, bottom: 8 },
    xAxis: {
      type: 'category',
      data: data.dates,
      show: false,
    },
    yAxis: data.series.map(() => ({
      type: 'value',
      scale: true,
      show: false,
    })),
    series: data.series.map((series, index) => toEChartsSeries(series, index)),
  } as EChartsOption
}
