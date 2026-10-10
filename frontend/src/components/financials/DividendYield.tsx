import { calculateDividendYield } from '@/lib/dividend-yield'
import { useDividends } from '@/lib/useDividends'

/** 只在信息条勾选股息率时挂载，不依赖 financial 能力。 */
export function DividendYield({ symbol, rawClose, date }: {
  symbol: string; rawClose?: number | null; date: string
}) {
  const { matrix, route, history } = useDividends(symbol)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const asOf = date.slice(0, 10) < today ? date.slice(0, 10) : today
  let value = '-'
  let title = '近12个月无现金分红数据，或缺少有效未复权股价'
  if (matrix.isError || (!matrix.isPending && !route?.usable) || history.isError) {
    value = '!'
    title = '分红派息数据源不可用或查询失败，请检查数据源配置'
  } else if (matrix.isPending || history.isPending) {
    value = '…'
    title = '正在加载分红数据'
  } else if (history.data) {
    const result = calculateDividendYield(history.data.data, rawClose, asOf)
    if (result != null) {
      value = `${result.toFixed(2)}%`
      title = `截至 ${asOf} 近12个月已实施税前现金分红 ÷ ${date.slice(0, 10)} 未复权股价`
    }
  }
  return <span title={title} aria-label={`股息率：${title}`}>{value}</span>
}
