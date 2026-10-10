// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DividendYield } from './DividendYield'

const state = vi.hoisted(() => ({
  matrix: { isPending: false, isError: false },
  route: { usable: true },
  history: { isPending: false, isError: false, data: { data: [] as any[] } },
}))
vi.mock('@/lib/useDividends', () => ({ useDividends: () => state }))

function render(rawClose: number | undefined = 20) {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<DividendYield symbol="600000.SH" rawClose={rawClose} date="2025-10-10" />)
  return host.textContent
}

beforeEach(() => {
  state.matrix = { isPending: false, isError: false }
  state.route = { usable: true }
  state.history = { isPending: false, isError: false, data: { data: [] } }
})

describe('股息率显示状态', () => {
  it('无分红显示短横线', () => expect(render()).toBe('-'))
  it('数据源不可用显示感叹号', () => {
    state.route.usable = false
    expect(render()).toBe('!')
  })
  it('能力配置读取失败显示感叹号', () => {
    state.matrix.isError = true
    expect(render()).toBe('!')
  })
  it('刷新失败时不把旧缓存值当作当前成功值', () => {
    state.history.isError = true
    state.history.data.data = [{ ex_date: '2025-06-01', cash_per_share: 1, currency: 'CNY' }]
    expect(render()).toBe('!')
  })
  it('加载中和有效结果分别展示', () => {
    state.history.isPending = true
    expect(render()).toBe('…')
    state.history.isPending = false
    state.history.data.data = [{ ex_date: '2025-06-01', cash_per_share: 1, currency: 'CNY' }]
    expect(render()).toBe('5.00%')
    expect(render(0)).toBe('-')
  })
})
