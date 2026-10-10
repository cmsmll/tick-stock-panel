import type { DividendRecord } from './api'

/** (asOf - 12个日历月, asOf] 已除息的税前现金分红 / 未复权价，返回百分点。 */
export function calculateDividendYield(
  records: DividendRecord[], rawClose: number | null | undefined, asOf: string,
): number | null {
  if (rawClose == null || !Number.isFinite(rawClose) || rawClose <= 0) return null
  const date = new Date(`${asOf}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== asOf) return null
  const year = date.getUTCFullYear() - 1
  const month = date.getUTCMonth()
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  const start = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
  let cash = 0
  for (const row of records) {
    const exDate = new Date(`${row.ex_date}T00:00:00Z`)
    if (!Number.isFinite(exDate.getTime()) || exDate.toISOString().slice(0, 10) !== row.ex_date) return null
    if (row.ex_date <= start || row.ex_date > asOf) continue
    if (!Number.isFinite(row.cash_per_share) || row.cash_per_share < 0) return null
    if (row.cash_per_share === 0) continue
    // A股股价为人民币；不能直接累计其他币种金额。
    if (row.currency !== 'CNY') return null
    cash += row.cash_per_share
  }
  const result = cash / rawClose * 100
  return cash > 0 && Number.isFinite(result) ? result : null
}
