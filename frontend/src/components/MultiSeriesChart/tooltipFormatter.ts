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
    `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;` +
    `background-color:${color};margin-right:6px"></span>`
  return `<div>${dot}${name}: <strong>${valueText}</strong></div>`
}

export function formatTooltip(
  isoDate: string,
  rows: TooltipSeriesValue[],
): string {
  const date = `<div style="margin-bottom:4px">${toDisplayDate(isoDate)}</div>`
  return date + rows.map(formatRow).join('')
}
