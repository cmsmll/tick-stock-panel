// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { StockIntradayChart } from './StockIntradayChart'

vi.mock('@/lib/api', () => ({ api: { klineMinute: vi.fn(), syncMinuteSingle: vi.fn() } }))
vi.mock('@/components/EChartsIntraday', () => ({
  EChartsIntraday: (props: any) => <div data-chart={JSON.stringify(props)} />,
}))
let cleanup = async () => {}
afterEach(async () => { await cleanup(); vi.clearAllMocks() })

it('分时直接显示上游行情、昨收和日汇总，切换口径隔离缓存，能力不足显示错误', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const row = { datetime: '2026-01-06 09:31:00', open: 19.1, high: 24.2, low: 18.3,
    close: 23.7, volume: 100, amount: 123456 }
  vi.mocked(api.klineMinute).mockImplementation(async (_s, _d, _l, adjust) => {
    if (adjust === 'forward') throw new Error('数据源不支持复权分时')
    return { symbol: '600000.SH', date: '2026-01-06', rows: [row], prev_close: 22.1,
      daily_summary: { date: '2026-01-06', open: 19.1, high: 24.2, low: 18.3, close: 23.7 } }
  })
  const host = document.createElement('div')
  const root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  cleanup = async () => { await act(async () => root.unmount()); client.clear() }
  const render = async (adjustment: 'none' | 'forward' | 'backward') => {
    await act(async () => root.render(<QueryClientProvider client={client}>
      <StockIntradayChart symbol="600000.SH" date="2026-01-06" adjustment={adjustment} prevClose={999} />
    </QueryClientProvider>))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  }
  await render('backward')
  const props = JSON.parse(host.querySelector('[data-chart]')!.getAttribute('data-chart')!)
  expect(props.data[0]).toEqual(row)
  expect(props.prevClose).toBe(22.1)
  expect(props.dailySummary.close).toBe(23.7)
  expect(props.showAvgLine).toBe(false)
  expect(api.klineMinute).toHaveBeenCalledWith('600000.SH', '2026-01-06', false, 'backward')
  await render('forward')
  expect(host.textContent).toContain('数据源不支持复权分时')
  expect(host.querySelector('[data-chart]')).toBeNull()
  expect(host.textContent).not.toContain('是否立即获取')
  await render('none')
  const raw = JSON.parse(host.querySelector('[data-chart]')!.getAttribute('data-chart')!)
  expect(raw.showAvgLine).toBe(true)
})
