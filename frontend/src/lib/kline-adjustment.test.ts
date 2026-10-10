// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { klineDailyQueryOptions, klineMinuteQueryOptions } from './kline'

describe('复权展示隔离', () => {
  it('查询键区分三种复权和旧调用，切模式不沿用旧价格占位', () => {
    const range = { start: '2026-01-01', end: '2026-10-10' }
    const options = [undefined, 'none', 'forward', 'backward'].map(mode =>
      klineDailyQueryOptions('600000.SH', range, undefined, mode as 'none' | 'forward' | 'backward' | undefined))
    expect(new Set(options.map(o => JSON.stringify(o.queryKey))).size).toBe(4)
    expect(options[1].placeholderData({ rows: [] }, { queryKey: options[2].queryKey })).toBeUndefined()
    const cached = { rows: [{ close: 10 }] }
    expect(options[1].placeholderData(cached, { queryKey: options[1].queryKey })).toBe(cached)
    expect(options[1].placeholderData(cached, { queryKey: ['kline', '600001.SH', '', '', '', 'none'] })).toBeUndefined()
  })
  it('分时缓存也区分复权方式和旧调用', () => {
    const options = [undefined, 'none', 'forward', 'backward'].map(mode =>
      klineMinuteQueryOptions('600000.SH', '2026-01-01', true, mode as 'none' | 'forward' | 'backward' | undefined))
    expect(new Set(options.map(o => JSON.stringify(o.queryKey))).size).toBe(4)
  })
})
