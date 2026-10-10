// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { StockDailyKChart } from './StockDailyKChart'

vi.mock('@/lib/api', () => ({ api: { klineDaily: vi.fn() } }))
vi.mock('@/components/EChartsCandlestick', () => ({
  EChartsCandlestick: ({ data }: any) => <div data-chart-price={data[0]?.close} />,
  SUB_CHARTS: [{ key: 'vol', label: '成交量', height: 70 }],
  OVERLAY_INDICATORS: [],
}))

let cleanup = async () => {}
afterEach(async () => { await cleanup(); vi.clearAllMocks() })

it('默认不复权，量比右侧切换复权；失败时仍可切回', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(api.klineDaily).mockImplementation(async (_s, _d, _r, _e, mode) => {
    if (mode === 'backward') throw new Error('数据源行情获取失败')
    return { symbol: '600000.SH', rows: [{ date: '2026-01-01', open: 10, high: 11, low: 9,
      close: mode === 'none' ? 10 : 5, raw_close: 10 }] }
  })
  const host = document.createElement('div')
  const root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  cleanup = async () => { await act(async () => root.unmount()); client.clear() }
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) }) }
  await act(async () => root.render(<QueryClientProvider client={client}>
    <StockDailyKChart symbol="600000.SH" dateRange={{ start: '2026-01-01', end: '2026-10-10' }} />
  </QueryClientProvider>))
  await flush()
  const select = host.querySelector<HTMLSelectElement>('[aria-label="复权方式"]')!
  expect(select.value).toBe('none')
  expect(host.querySelector('[data-chart-price]')?.getAttribute('data-chart-price')).toBe('10')
  expect(host.querySelector('[aria-label="量能对比周期"]')!.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const change = async (value: string) => {
    await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await flush()
  }
  await change('forward')
  expect(host.querySelector('[data-chart-price]')?.getAttribute('data-chart-price')).toBe('5')
  await change('backward')
  expect(host.textContent).toContain('数据源行情获取失败')
  expect(host.querySelector('[data-chart-price]')).toBeNull()
  await change('none')
  expect(host.querySelector('[data-chart-price]')?.getAttribute('data-chart-price')).toBe('10')
})
