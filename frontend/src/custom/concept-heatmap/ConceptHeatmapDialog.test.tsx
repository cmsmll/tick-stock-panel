// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Dialog, { heatColor, heatData } from './ConceptHeatmapDialog'

vi.mock('echarts', () => ({ init: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }) }))
let root: Root, host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals()
})
it('uses constituent counts as area and decimal returns as percentage labels; missing quotes stay missing', () => {
  const data = heatData([{ key: '上涨', count: 10, avgPct: 0.025 }, { key: '缺行情', count: 5, avgPct: null }, { key: '空', count: 0, avgPct: 0 }])
  expect(data).toHaveLength(2)
  expect(data[0].value).toBe(10)
  expect(data[0].change).toContain('2.50%')
  expect(data[1].change).toBe('暂无行情')
  expect(heatColor(-0.025)).not.toBe(heatColor(0.025))
  expect(heatColor(null)).toBe(heatColor(NaN))
})
it('maximizes, restores and closes the independent dialog', async () => {
  const close = vi.fn()
  await act(async () => root.render(<Dialog rows={[]} loading={false} error={false} onRetry={vi.fn()} onClose={close} />))
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.textContent).toContain('暂无概念数据')
  await act(async () => (document.querySelector('[aria-label="最大化热力图"]') as HTMLElement).click())
  expect(dialog.className).toContain('h-[100dvh]')
  await act(async () => (document.querySelector('[aria-label="还原热力图"]') as HTMLElement).click())
  expect(dialog.className).toContain('h-[82dvh]')
  await act(async () => (document.querySelector('[aria-label="关闭热力图"]') as HTMLElement).click())
  expect(close).toHaveBeenCalledOnce()
})
it('shows loading and failure states and allows retry', async () => {
  const retry = vi.fn()
  await act(async () => root.render(<Dialog rows={[]} loading error={false} onRetry={retry} onClose={vi.fn()} />))
  expect(document.body.textContent).toContain('正在加载概念行情')
  await act(async () => root.render(<Dialog rows={[]} loading={false} error onRetry={retry} onClose={vi.fn()} />))
  expect(document.querySelector('[role="alert"]')).not.toBeNull()
  await act(async () => (document.querySelector('[role="alert"] button') as HTMLElement).click())
  expect(retry).toHaveBeenCalledOnce()
})
