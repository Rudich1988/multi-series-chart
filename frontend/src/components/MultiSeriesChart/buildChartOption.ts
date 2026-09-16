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

// The hovered point on area/spline/line turns into a small, crisp, white-filled marker with a
// colored border — found by zooming into specs/reference/frames/frame_08.png and frame_12.png:
// the marker itself is NOT tinted/translucent, only the separate halo behind it is (see
// `buildHaloSeries`). Per-type symbol shape also comes straight from those crops: Cost gets a
// plain circle, ROI confirmed a diamond, Conversions keeps its always-visible square.
function buildPointEmphasis(color: string) {
  return {
    itemStyle: {
      color: '#fff',
      borderColor: color,
      borderWidth: 2,
    },
  }
}

// Soft, separate circular halo behind the point marker — a companion series sharing the real
// series' data/axis, invisible in the normal state and only shown (as a big, low-opacity circle)
// on emphasis. A halo is a SEPARATE series, not just `shadowBlur` on the real marker, because
// `shadowBlur` follows the marker's own silhouette (diamond-shaped blur for a diamond marker,
// square-shaped for a square) — the reference's halo is a plain circle regardless of the marker's
// shape underneath it (confirmed in the same crops as `buildPointEmphasis`). `silent: true` keeps
// it out of its own mouse/click handling; `buildTooltipFormatter` filters it out of the tooltip
// content by index, deliberately *not* `tooltip: { show: false }` here — found via a live,
// isolated repro (not by reasoning about the docs) that `tooltip.show: false` on a series doesn't
// just drop it from the tooltip text, it also opts that series out of ECharts' automatic
// "highlight every series at the hovered axis index" dispatch, so the halo never emphasized at
// all with it set. Without it, the halo still lights up in sync with its real series for free,
// exactly because that automatic cross-series highlight dispatch reaches every series that
// doesn't opt out.
function buildHaloSeries(series: SeriesDto, yAxisIndex: number) {
  return {
    type: 'line',
    yAxisIndex,
    data: series.values,
    silent: true,
    showSymbol: false,
    symbol: 'circle',
    symbolSize: 34,
    // Below the real marker's own `z` (3) — found via pixel-sampling the rendered marker, not by
    // reasoning about draw order: without this, the halo's semi-transparent fill painted *over*
    // the real marker's opaque white fill (even though the halo series comes later in the array,
    // and even though the marker's own border stroke correctly stayed on top — zrender appears to
    // batch fills and strokes in separate passes), tinting the marker's center a blended pastel
    // instead of leaving it solid white. Explicit `z` forces the halo behind regardless.
    z: 1,
    lineStyle: { opacity: 0 },
    itemStyle: { opacity: 0 },
    emphasis: {
      lineStyle: { opacity: 0 },
      itemStyle: { color: series.color, opacity: 0.3, borderWidth: 0 },
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
// round down to literally 0px. Calibrated by measuring the live render against a stated pixel
// target (research.md §15.1.2), not by eye.
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

// Bar emphasis stays a translucent glow directly on the bar itself (no separate halo series —
// unlike a point marker, the bar's own rectangle already reads as "the shape being highlighted").
function buildBarEmphasis(color: string) {
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
  }

  // area/spline hide their symbol normally (`showSymbol: false`) but ECharts still shows the
  // emphasis-state symbol at the hovered index, which is exactly how the reference GIF renders
  // a point that only appears on hover, not permanently on the line.
  const byChartType: Record<ChartType, object> = {
    area: {
      ...base,
      type: 'line',
      areaStyle: {},
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 10,
      // Above the halo's `z` (1) — see `buildHaloSeries` for why this matters.
      z: 3,
      emphasis: buildPointEmphasis(series.color),
    },
    // `barMinHeight`: guarantees even the smallest value still renders as a visible sliver,
    // instead of rounding down to 0px against BAR_HEADROOM's compressed scale. `z: 10` (default
    // is 2): found via pixel-measuring the live render, not by eye — ECharts was drawing `area`'s
    // semi-transparent fill *after* (on top of) the bar regardless of `cost` coming first in the
    // series array, blending the bar into a dull gray smear instead of showing it as a crisp blue
    // rectangle (confirmed by computing the exact alpha-blend: `cost`'s fill color over the bar's
    // blue reproduces the measured color almost exactly). A higher `z` forces the bar back on top.
    // `barWidth`: measured the reference's actual bar footprint vs. its category band
    // (frame_21.png: ~30px bar in a ~118px band, ≈25%) — ECharts' default is much wider (~67% of
    // the band in this chart), which read as "too fat" compared to the reference's slim bars.
    bar: {
      ...base,
      type: 'bar',
      barMinHeight: 2,
      barWidth: '25%',
      z: 10,
      emphasis: buildBarEmphasis(series.color),
    },
    spline: {
      ...base,
      type: 'line',
      smooth: true,
      showSymbol: false,
      symbol: 'diamond',
      symbolSize: 10,
      // Above the halo's `z` (1) — see `buildHaloSeries` for why this matters.
      z: 3,
      // Bolder normally, thinner on hover, per explicit user direction. (An earlier pass
      // concluded the reference's apparent thick/thin variation was just a rendering artifact of
      // a constant-width stroke on a curve of varying slope, not a real hover-triggered change,
      // and left this alone — but the user re-confirmed the behavior after seeing it live, so
      // implemented directly rather than re-arguing the point from stills.)
      lineStyle: { width: 4 },
      emphasis: {
        ...buildPointEmphasis(series.color),
        lineStyle: { width: 1.5 },
      },
    },
    line: {
      ...base,
      type: 'line',
      symbol: 'rect',
      symbolSize: 8,
      // Above the halo's `z` (1) — see `buildHaloSeries` for why this matters.
      z: 3,
      emphasis: buildPointEmphasis(series.color),
    },
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
//
// `seriesIndex` here refers to the *real* series' position in `buildChartOption`'s combined
// `series` array. Real series are placed first (indices `0..data.series.length-1`), halo
// companion series after — so this index is the same whether or not halos exist.
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
// no guaranteed order. Matched back to `series` (the DTO array, real series only) by
// `seriesIndex` rather than array position; halo companion series (indices >= `series.length`
// in the actual ECharts option) are filtered out here rather than excluded via an ECharts-level
// option, since `series[point.seriesIndex]` would otherwise resolve to `undefined` for them.
function buildTooltipFormatter(series: SeriesDto[]) {
  return (raw: TooltipComponentFormatterCallbackParams): string => {
    const points = Array.isArray(raw) ? raw : [raw]
    if (points.length === 0) return ''

    const rows: TooltipSeriesValue[] = points
      .filter(
        (point) =>
          point.seriesIndex !== undefined && point.seriesIndex < series.length,
      )
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
  const realSeries = data.series.map((series, index) =>
    toEChartsSeries(series, index),
  )
  const haloSeries = data.series
    .map((series, index) => ({ series, index }))
    .filter(({ series }) => series.chartType !== 'bar')
    .map(({ series, index }) => buildHaloSeries(series, index))

  return {
    grid: { left: 8, right: 8, top: 8, bottom: 8 },
    xAxis: {
      type: 'category',
      data: data.dates,
      show: false,
    },
    yAxis: data.series.map(buildYAxis),
    series: [...realSeries, ...haloSeries],
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
