import { describe, expect, it } from 'vitest'
import {
  formatTooltip,
  type TooltipSeriesValue,
} from '../../src/components/MultiSeriesChart/tooltipFormatter'

const sampleRows: TooltipSeriesValue[] = [
  { name: 'Cost', color: '#F5E1A4', decimals: 2, value: 44.36 },
  { name: 'CPA', color: '#5B8DEF', decimals: 2, value: 1.23 },
  { name: 'ROI confirmed', color: '#1B5E20', decimals: 2, value: 161.47 },
  { name: 'Conversions', color: '#B026C7', decimals: 0, value: 36 },
]

describe('formatTooltip', () => {
  it('formats the ISO date as DD.MM.YYYY, matching the reference tooltip', () => {
    const html = formatTooltip('2026-06-12', sampleRows)

    expect(html).toContain('12.06.2026')
    expect(html).not.toContain('2026-06-12')
  })

  it('renders one row per series with its name and value formatted to its own decimals', () => {
    const html = formatTooltip('2026-06-12', sampleRows)

    expect(html).toContain('Cost')
    expect(html).toContain('44.36')
    expect(html).toContain('CPA')
    expect(html).toContain('1.23')
    expect(html).toContain('ROI confirmed')
    expect(html).toContain('161.47')
    expect(html).toContain('Conversions')
    // 0 decimals: no trailing ".00"
    expect(html).toContain('36')
    expect(html).not.toContain('36.0')
  })

  it("includes each series' color for its row's colored dot", () => {
    const html = formatTooltip('2026-06-12', sampleRows)

    for (const row of sampleRows) {
      expect(html).toContain(row.color)
    }
  })

  it('shows "no data" instead of a number when a series has no value for that date', () => {
    const rowsWithGap: TooltipSeriesValue[] = [
      ...sampleRows.slice(0, 1),
      { name: 'CPA', color: '#5B8DEF', decimals: 2, value: null },
    ]

    const html = formatTooltip('2026-06-12', rowsWithGap)

    expect(html).toContain('no data')
  })

  it('preserves the given series order in the output', () => {
    const html = formatTooltip('2026-06-12', sampleRows)

    const positions = sampleRows.map((row) => html.indexOf(row.name))
    const sorted = [...positions].sort((a, b) => a - b)

    expect(positions).toEqual(sorted)
    expect(positions.every((p) => p !== -1)).toBe(true)
  })
})
