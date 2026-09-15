export interface TooltipSeriesValue {
  name: string
  color: string
  decimals: number
  value: number | null
}

// Reference tooltip uses DD.MM.YYYY (specs/reference/frames/frame_10.png); the backend sends
// ISO YYYY-MM-DD (contracts/chart-api.md). Plain string manipulation avoids a Date object and
// the timezone-shift bugs that come with parsing/reformatting dates through one.
function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year}`
}

function formatRow({
  name,
  color,
  decimals,
  value,
}: TooltipSeriesValue): string {
  const valueText = value === null ? 'no data' : value.toFixed(decimals)
  const dot =
    `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;` +
    `background-color:${color};margin-right:8px;flex-shrink:0"></span>`
  return (
    `<div style="display:flex;align-items:center;padding:3px 0;white-space:nowrap">` +
    `${dot}${name}:&nbsp;<strong>${valueText}</strong></div>`
  )
}

// Every row (including the date) is explicitly left-aligned and flex-laid-out: ECharts' default
// tooltip content is center-aligned, which — found via manual browser verification, not by any
// test — left each row individually centered under the widest one instead of forming one flush-
// left column like the reference (specs/reference/frames/frame_10.png). `white-space: nowrap`
// keeps a row from wrapping mid-value if the tooltip's auto width is ever tighter than a line.
export function formatTooltip(
  isoDate: string,
  rows: TooltipSeriesValue[],
): string {
  const date = `<div style="padding:3px 0 6px;font-weight:600">${toDisplayDate(isoDate)}</div>`
  const rowsHtml = rows.map(formatRow).join('')
  return `<div style="text-align:left">${date}${rowsHtml}</div>`
}
