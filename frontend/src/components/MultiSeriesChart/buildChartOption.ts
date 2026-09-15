import type {
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import type {
  ChartDataResponseDto,
  ChartType,
  SeriesDto,
} from '../../types/chart'
import { formatTooltip, type TooltipSeriesValue } from './tooltipFormatter'

// Soft glow in the series' own color, scaled up on hover — the "halo" from the reference
// (specs/reference/frames/frame_10.png etc.), applied uniformly so all 4 series (including bar/
// area, which have no persistent point marker) highlight the same way at the hovered X (FR-006).
function buildEmphasis(color: string) {
  return {
    scale: 2.5,
    itemStyle: {
      color,
      opacity: 0.35,
      borderWidth: 0,
      shadowBlur: 20,
      shadowColor: color,
    },
  }
}

function toEChartsSeries(series: SeriesDto, yAxisIndex: number) {
  const base = {
    name: series.name,
    yAxisIndex,
    data: series.values,
    color: series.color,
    emphasis: buildEmphasis(series.color),
  }

  // area/spline hide their symbol normally (`showSymbol: false`) but ECharts still shows the
  // emphasis-state symbol at the hovered index, which is exactly how the reference GIF renders
  // their halo — a point that only appears on hover, not permanently on the line.
  const byChartType: Record<ChartType, object> = {
    area: { ...base, type: 'line', areaStyle: {}, showSymbol: false },
    bar: { ...base, type: 'bar' },
    spline: { ...base, type: 'line', smooth: true, showSymbol: false },
    line: { ...base, type: 'line', symbol: 'rect', symbolSize: 8 },
  }

  return byChartType[series.chartType]
}

// `trigger: 'axis'` calls this with one CallbackDataParams per series at the hovered date, in
// no guaranteed order — matched back to `series` by `seriesIndex` rather than array position.
function buildTooltipFormatter(series: SeriesDto[]) {
  return (raw: TooltipComponentFormatterCallbackParams): string => {
    const points = Array.isArray(raw) ? raw : [raw]
    if (points.length === 0) return ''

    const rows: TooltipSeriesValue[] = points
      .filter((point) => point.seriesIndex !== undefined)
      .map((point) => {
        const matched = series[point.seriesIndex as number]
        return {
          name: matched.name,
          color: matched.color,
          decimals: matched.decimals,
          value: (point.value as number | null | undefined) ?? null,
        }
      })

    return formatTooltip(String(points[0].name), rows)
  }
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
    tooltip: {
      trigger: 'axis',
      // The reference has no persistent vertical guide line — only the tooltip + per-series
      // halos communicate the hovered X, so no visual axis pointer is drawn.
      axisPointer: { type: 'none' },
      // FR-009: keeps the tooltip fully inside the chart's bounds near the first/last date.
      confine: true,
      // FR-008: ~100-150ms fast fade, vs. ECharts' 400ms default.
      transitionDuration: 0.12,
      formatter: buildTooltipFormatter(data.series),
    },
  } as EChartsOption
}
