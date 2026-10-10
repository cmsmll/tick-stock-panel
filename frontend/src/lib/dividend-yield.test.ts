// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { DividendRecord } from './api'
import { calculateDividendYield } from './dividend-yield'

const dividend = (ex_date: string, cash_per_share = 0.5): DividendRecord => ({
  symbol: '600000.SH', ex_date, cash_per_share, bonus_per_share: 0, currency: 'CNY',
})

describe('近12个月股息率（百分点）', () => {
  it('汇总已实施税前每股分红，以未复权价计算', () => {
    expect(calculateDividendYield([dividend('2026-01-10'), dividend('2026-06-10')], 20, '2026-10-10')).toBe(5)
  })
  it('左开右闭，排除未来和12个月以前的记录', () => {
    expect(calculateDividendYield([
      dividend('2025-10-10', 10), dividend('2025-10-11'),
      dividend('2026-10-10'), dividend('2026-10-11', 10),
    ], 20, '2026-10-10')).toBe(5)
  })
  it('闰年按日历12个月处理', () => {
    expect(calculateDividendYield([dividend('2023-02-28', 10), dividend('2023-03-01')], 10, '2024-02-29')).toBe(5)
  })
  it('无现金分红不伪装成零股息率', () => {
    for (const records of [[], [dividend('2024-01-01')], [dividend('2026-01-01', 0)]]) {
      expect(calculateDividendYield(records, 10, '2026-10-10')).toBeNull()
    }
  })
  it('原始股价缺失或非法不降级使用复权价', () => {
    for (const price of [undefined, null, 0, -1, NaN, Infinity]) {
      expect(calculateDividendYield([dividend('2026-01-01')], price, '2026-10-10')).toBeNull()
    }
  })
  it('币种不匹配、非法日期和金额不可计算', () => {
    expect(calculateDividendYield([{ ...dividend('2026-01-01'), currency: 'USD' }], 10, '2026-10-10')).toBeNull()
    expect(calculateDividendYield([dividend('bad')], 10, '2026-10-10')).toBeNull()
    expect(calculateDividendYield([dividend('2026-01-01', NaN)], 10, '2026-10-10')).toBeNull()
  })
})
