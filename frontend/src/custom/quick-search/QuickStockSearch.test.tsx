// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { QuickStockSearch } from './QuickStockSearch'

vi.mock('@/lib/api', () => ({ api: { instrumentSearch: vi.fn() } }))
vi.mock('@/components/StockPreviewDialog', () => ({
  StockPreviewDialog: ({ symbol }: { symbol: string | null }) => symbol ? <div data-preview>{symbol}</div> : null,
}))
let host: HTMLDivElement, root: Root, client: QueryClient
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  vi.mocked(api.instrumentSearch).mockReset().mockResolvedValue({ results: [{ symbol: '601919.SH', name: '中远海控', code: '601919' }] })
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(<QueryClientProvider client={client}><QuickStockSearch /></QueryClientProvider>))
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear(); host.remove(); vi.useRealTimers()
})
async function key(key: string, target: EventTarget = document.body, extra: KeyboardEventInit = {}) {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })) })
}
async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(220) })
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
}
it('opens with the first character, searches stocks and opens the shared quote preview', async () => {
  await key('6'); await settle()
  expect(document.querySelector('input')?.value).toBe('6')
  expect(api.instrumentSearch).toHaveBeenCalledWith('6', 20, 'stock')
  expect(document.body.textContent).toContain('中远海控')
  await act(async () => { (document.querySelector('[role="option"]') as HTMLElement).click() })
  expect(document.querySelector('[data-preview]')?.textContent).toBe('601919.SH')
  expect(document.querySelector('[aria-label="快捷搜索"]')).toBeNull()
})
it.each(['input', 'textarea', 'select', '[contenteditable]', '[role=textbox]'])('does not interrupt editing in %s', async selector => {
  const el = document.createElement(selector.startsWith('[') ? 'div' : selector)
  if (selector === '[contenteditable]') el.setAttribute('contenteditable', 'true')
  if (selector === '[role=textbox]') el.setAttribute('role', 'textbox')
  host.append(el)
  await key('6', el); await settle()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(api.instrumentSearch).not.toHaveBeenCalled()
})
it('ignores modifiers and IME events; Escape closes without reopening', async () => {
  await key('k', document.body, { ctrlKey: true })
  await key('a', document.body, { metaKey: true })
  await key('a', document.body, { altKey: true })
  await key('n', document.body, { isComposing: true })
  expect(document.querySelector('input')).toBeNull()
  await key('6'); await settle(); await key('Escape')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
it('supports arrow selection and Enter', async () => {
  vi.mocked(api.instrumentSearch).mockResolvedValue({ results: [
    { symbol: '601919.SH', name: '中远海控', code: '601919' },
    { symbol: '300533.SZ', name: '冰川网络', code: '300533' },
  ] })
  await key('3'); await settle()
  await key('ArrowDown', document.querySelector('input')!)
  await key('Enter', document.querySelector('input')!)
  expect(document.querySelector('[data-preview]')?.textContent).toBe('300533.SZ')
})
it('shows empty and failed searches without opening a stock', async () => {
  vi.mocked(api.instrumentSearch).mockResolvedValue({ results: [] })
  await key('z'); await settle()
  expect(document.body.textContent).toContain('未找到匹配的股票')
  await key('Escape')
  vi.mocked(api.instrumentSearch).mockRejectedValue(new Error('offline'))
  await key('x'); await settle()
  expect(document.body.textContent).toContain('搜索失败')
  expect(document.querySelector('[data-preview]')).toBeNull()
})
it('does not open over another modal or intercept nested editable content', async () => {
  const editor = document.createElement('div')
  editor.contentEditable = 'true'; editor.setAttribute('contenteditable', 'true')
  const child = document.createElement('span'); editor.append(child); host.append(editor)
  await key('6', child)
  const dialog = document.createElement('div'); dialog.setAttribute('aria-modal', 'true'); host.append(dialog)
  await key('6')
  expect(document.querySelector('input')).toBeNull()
})
it('hides old results immediately when the query changes and prevents stale selection', async () => {
  await key('6'); await settle()
  const field = document.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '300533')
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(document.querySelector('[role="option"]')).toBeNull()
  await key('Enter', field)
  expect(document.querySelector('[data-preview]')).toBeNull()
})
it('does not search until opened and removes the global listener on unmount', async () => {
  await settle()
  expect(api.instrumentSearch).not.toHaveBeenCalled()
  await act(async () => root.render(<></>))
  await key('6'); await settle()
  expect(document.querySelector('input')).toBeNull()
  expect(api.instrumentSearch).not.toHaveBeenCalled()
})
