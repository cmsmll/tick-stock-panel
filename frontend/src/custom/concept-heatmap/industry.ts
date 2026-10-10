import type { MarketSnapshotRow } from '@/lib/api'
import type { ConceptHeatmapRow } from './ConceptHeatmapDialog'

export function industryHeatRows(rows: Record<string, unknown>[], quotes: MarketSnapshotRow[], level: number): ConceptHeatmapRow[] {
  const code = (value: unknown) => String(value ?? '').trim().replace(/\.(SH|SZ|BJ)$/i, '')
  const market = new Map(quotes.map(row => [code(row.symbol), row.change_pct]))
  const groups = new Map<string, Map<string, number | null>>()
  for (const row of rows) {
    const symbol = code(row.symbol || row['股票代码'] || row.code)
    if (!symbol) continue
    // Preserve empty segments: a missing second level must not become the third level.
    const parts = String(row['所属同花顺行业'] ?? '').split('-').map(part => part.trim())
    const name = parts[level - 1]
    const key = name && !['nan', 'none', 'null'].includes(name.toLowerCase()) ? name : '未分类'
    const stocks = groups.get(key) ?? new Map<string, number | null>()
    const pct = market.has(symbol) ? market.get(symbol) : row.change_pct
    stocks.set(symbol, typeof pct === 'number' && Number.isFinite(pct) ? pct : null)
    groups.set(key, stocks)
  }
  return [...groups].map(([key, stocks]) => {
    const values = [...stocks.values()].filter((value): value is number => value !== null)
    return { key, count: stocks.size, avgPct: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
  })
}
