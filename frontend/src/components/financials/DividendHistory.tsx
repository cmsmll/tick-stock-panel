import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import { useCapabilityMatrix } from '@/lib/useSharedQueries'

export function DividendHistory({ symbol }: { symbol: string }) {
  const matrix = useCapabilityMatrix()
  const route = matrix.data?.capabilities.find(cap => cap.id === 'dividends')
  const history = useQuery({
    queryKey: QK.dividends(symbol, route?.effective ?? '', matrix.dataUpdatedAt),
    queryFn: () => api.dividendHistory(symbol),
    enabled: !!symbol && !!route?.usable,
    staleTime: 300_000,
    retry: false,
  })
  if (matrix.isLoading) return <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted" />
  if (matrix.isError) return <div className="py-8 text-center text-sm text-secondary">无法读取数据源配置 <button className="text-accent" onClick={() => matrix.refetch()}>重试</button></div>
  if (!route?.usable) return (
    <div className="py-8 text-center text-sm text-secondary">
      分红派息数据源不可用，请配置可用的数据源。
      <Link to="/settings?tab=data-sources" className="ml-2 text-accent">前往数据源配置</Link>
    </div>
  )
  const rows = history.data?.data ?? []
  const number = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 10 })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>数据源：{route.effective_display} · {rows.length} 条记录</span>
        <button disabled={history.isFetching} onClick={() => history.refetch()} className="inline-flex items-center gap-1 text-accent disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${history.isFetching ? 'animate-spin' : ''}`} />刷新记录
        </button>
      </div>
      <p className="text-xs text-muted">金额为税前、当次分配时的每股口径。各期按除权除息日展示；数据源未提供预案公告日及股权登记日，显示为“—”。</p>
      {history.isLoading ? <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted" />
        : history.isError ? <div role="alert" className="py-8 text-center text-sm text-danger">{history.error.message}，请点击刷新记录重试。</div>
        : rows.length === 0 ? <div className="py-8 text-center text-sm text-muted">暂无分红派息历史记录</div>
        : <div className="space-y-5">
          {rows.map((row, index) => (
            <section key={`${row.ex_date}:${index}`} aria-label={`除权除息日 ${row.ex_date}`}>
              <div className="text-[11px] text-muted mb-2 flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" />
                报告期 <span className="font-mono text-secondary">{row.ex_date}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                {[
                  { label: '预案公告日', value: '—' },
                  { label: '股权登记日', value: '—' },
                  { label: '除权除息日', value: row.ex_date },
                  { label: '每股派息（税前）', value: number(row.cash_per_share) },
                  { label: '每10股派息（税前）', value: number(row.cash_per_share * 10) },
                  { label: '每10股送转', value: `${number(row.bonus_per_share * 10)} 股` },
                ].map(field => (
                  <div key={field.label} className="flex items-baseline justify-between gap-3 py-2 border-b border-border/40">
                    <span className="text-xs text-secondary shrink-0">{field.label}</span>
                    <span className="text-sm font-mono tabular-nums text-foreground text-right">{field.value}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>}
    </div>
  )
}
