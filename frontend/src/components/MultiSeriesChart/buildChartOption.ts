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

// Bar-type series (CPA) render small but visibly varying — never filling the chart height the way
// the other 3 series do, but never fully flat either. Found via pixel-measuring
// specs/reference/frames/frame_21.png: CPA's 5 bars are only ~1-3px tall (out of a ~300px plot)
// but *do* differ slightly with the value, not identical/flat.
//   - Fitting the bar's own axis tightly to its own min/max, like `scale: true` gives every other
//     series, fills nearly the whole chart height with a low-magnitude series like CPA — the
//     original "giant bars" bug report.
//   - Zero-basing against the *entire dataset's* max (the first fix) overcorrected the other way:
//     on this chart's actual pixel height, that scale puts every bar's value under 1px, which
//     rendered as fully invisible/flat instead of "small but present" — reported after that fix.
// Landed on: the bar's own max reaches a fixed fraction of the chart height (`1 / BAR_HEADROOM`),
// so a bar series stays visibly subdued relative to whatever the line/area/spline series' own
// magnitudes happen to be, while the bar's own relative variation (its min vs. max) is fully
// preserved and visible. `barMinHeight` (in `toEChartsSeries`) is a floor so a value can't ever
// round down to literally 0px. Not an exact reference pixel match (research.md §15.2 — the GIF's
// original capture resolution isn't recoverable) but the qualitative target — small, subdued,
// still legibly different bar-to-bar — is.
const BAR_HEADROOM = 25

function buildYAxis(series: SeriesDto) {
  if (series.chartType === 'bar') {
    const ownValues = series.values.filter(
      (value): value is number => value !== null,
    )
    const ownMax = Math.max(...ownValues)
    return { type: 'value', min: 0, max: ownMax * BAR_HEADROOM, show: false }
  }
  return { type: 'value', scale: true, show: false }
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
    // `barMinHeight`: guarantees even the smallest value still renders as a visible sliver,
    // instead of rounding down to 0px against BAR_HEADROOM's compressed scale. `z: 10` (default
    // is 2): found via pixel-measuring the live render, not by eye — ECharts was drawing `area`'s
    // semi-transparent fill *after* (on top of) the bar regardless of `cost` coming first in the
    // series array, blending the bar into a dull gray smear instead of showing it as a crisp blue
    // rectangle (confirmed by computing the exact alpha-blend: `cost`'s fill color over the bar's
    // blue reproduces the measured color almost exactly). A higher `z` forces the bar back on top.
    bar: { ...base, type: 'bar', barMinHeight: 2, z: 10 },
    spline: { ...base, type: 'line', smooth: true, showSymbol: false },
    line: { ...base, type: 'line', symbol: 'rect', symbolSize: 8 },
  }

  return byChartType[series.chartType]
}

// A sharp, non-gradient color split on the ROI confirmed line at `roiThreshold.value` (FR: spec's
// "hard color change on threshold crossing"), implemented as ECharts' standard piecewise-visualMap-
// on-a-line-series feature — it colors each line *segment* by which piece its value falls into, no
// gradient. `lte`/`gt` so a value exactly on the threshold renders as at/below, per spec Edge
// Cases. `show: false` hides the piecewise legend widget ECharts draws by default — spec
// explicitly needs no separate chart legend beyond the tooltip's colored dots.
//
// Both pieces get explicit, finite bounds derived from the series' own min/max — found via manual
// browser verification, not by any test: ECharts 6's line-gradient renderer (`getVisualGradient` /
// `clipColorStops` in `LineView`) throws `Cannot read properties of undefined (reading 'coord')`
// when a piece is left open-ended (defaulting to +/-Infinity), even in a minimal reproduction with
// no other options involved. Bounding both pieces to comfortably cover the actual data range
// sidesteps the bug while remaining functionally identical (every value is within [min, max] by
// construction, so nothing can fall outside either piece).
function buildRoiVisualMap(data: ChartDataResponseDto) {
  const roiIndex = data.series.findIndex(
    (series) => series.key === 'roi_confirmed',
  )
  if (roiIndex === -1) return undefined

  const roiValues = data.series[roiIndex].values.filter(
    (value): value is number => value !== null,
  )
  const { value, aboveColor, atOrBelowColor } = data.roiThreshold
  const lowerBound = Math.min(value, ...roiValues) - 1
  const upperBound = Math.max(value, ...roiValues) + 1

  return {
    type: 'piecewise',
    show: false,
    seriesIndex: roiIndex,
    pieces: [
      { gt: lowerBound, lte: value, color: atOrBelowColor },
      { gt: value, lte: upperBound, color: aboveColor },
    ],
  }
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
    yAxis: data.series.map(buildYAxis),
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
      // ECharts' tooltip defaults (padding 5, ~14px text) render noticeably smaller/denser than
      // the reference's tooltip box (specs/reference/frames/frame_10.png) — scaled up to match.
      padding: 14,
      textStyle: { fontSize: 16 },
      formatter: buildTooltipFormatter(data.series),
    },
    visualMap: buildRoiVisualMap(data),
  } as EChartsOption
}
