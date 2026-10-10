import { expect, it } from 'vitest'
import { industryHeatRows } from './industry'

const stocks = [
  { symbol: '600000.SH', 所属同花顺行业: '金融-银行-股份制银行' },
  { symbol: '600000', 所属同花顺行业: '金融-银行-股份制银行' },
  { symbol: '600001.SH', 所属同花顺行业: '金融-银行-城商行' },
  { symbol: '600002.SH', 所属同花顺行业: '制造--设备' },
  { symbol: '600003.SH', 所属同花顺行业: '制造' },
]
it('groups each level, deduplicates symbols and averages only valid decimal returns', () => {
  const quotes = [{ symbol: '600000.SH', change_pct: 0.02 }, { symbol: '600001.SH', change_pct: null }]
  expect(industryHeatRows(stocks, quotes, 1)).toEqual([
    { key: '金融', count: 2, avgPct: 0.02 }, { key: '制造', count: 2, avgPct: null },
  ])
  expect(industryHeatRows(stocks, quotes, 2).map(r => r.key)).toEqual(['银行', '未分类'])
  expect(industryHeatRows(stocks, quotes, 3).map(r => r.key)).toEqual(['股份制银行', '城商行', '设备', '未分类'])
})
it('does not use stale row returns when the quote explicitly has no value', () => {
  expect(industryHeatRows([{ symbol: '600000.SH', change_pct: 0.5 }], [{ symbol: '600000.SH', change_pct: null }], 1))
    .toEqual([{ key: '未分类', count: 1, avgPct: null }])
  expect(industryHeatRows([], [], 1)).toEqual([])
})
