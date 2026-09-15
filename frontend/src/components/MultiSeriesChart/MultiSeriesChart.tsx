import * as echarts from 'echarts'
import { useEffect, useRef, useState } from 'react'
import { fetchChartData } from '../../api/chartApi'
import type { ChartDataResponseDto } from '../../types/chart'
import { buildChartOption } from './buildChartOption'
import './MultiSeriesChart.css'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; data: ChartDataResponseDto }

export function MultiSeriesChart() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    fetchChartData()
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'success' || !containerRef.current) return

    const chart = echarts.init(containerRef.current)
    chart.setOption(buildChartOption(state.data))

    return () => {
      chart.dispose()
    }
  }, [state])

  if (state.status === 'loading') {
    return (
      <div className="multi-series-chart multi-series-chart--loading">
        Loading chart…
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="multi-series-chart multi-series-chart--error">
        Failed to load chart data.
      </div>
    )
  }

  return <div ref={containerRef} className="multi-series-chart" />
}
