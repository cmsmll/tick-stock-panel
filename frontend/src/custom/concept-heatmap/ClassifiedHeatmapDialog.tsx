import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import Dialog, { type ConceptHeatmapProps } from './ConceptHeatmapDialog'
import { industryHeatRows } from './industry'
import { resolveDimension } from '@/lib/analysis-adapter'

const LABELS = ['概念', '一级行业', '二级行业', '三级行业']
const INDUSTRY_ID = 'ext_hy_ths'
const LIMIT = 12000

export default function ClassifiedHeatmapDialog(props: ConceptHeatmapProps & { initialLevel?: 0 | 2 }) {
  const [level, setLevel] = useState<number>(props.initialLevel ?? 0)
  const localConcept = props.initialLevel === 2
  const client = useQueryClient()
  const configs = useQuery({ queryKey: QK.extData, queryFn: api.extDataList, enabled: localConcept && level === 0 })
  const industry = useQuery({
    queryKey: QK.extDataRows(INDUSTRY_ID, undefined, LIMIT),
    queryFn: () => api.extDataRows(INDUSTRY_ID, { limit: LIMIT }),
    enabled: level > 0,
  })
  const market = useQuery({ queryKey: QK.marketSnapshot, queryFn: api.marketSnapshot, enabled: level > 0 || localConcept, staleTime: 60_000 })
  const concepts = useQuery({
    queryKey: QK.extDataRows('ext_gn_ths', undefined, LIMIT),
    queryFn: () => api.extDataRows('ext_gn_ths', { limit: LIMIT }),
    enabled: localConcept && level === 0,
  })
  const conceptRows = useMemo(() => {
    const groups = resolveDimension(concepts.data, configs.data?.items.find(item => item.id === 'ext_gn_ths'), ['concept', '概念', 'theme']).groups
    const code = (value: unknown) => String(value ?? '').replace(/\.(SH|SZ|BJ)$/i, '')
    const quotes = new Map((market.data?.rows ?? []).map(row => [code(row.symbol), row.change_pct]))
    return groups.map(group => {
      const stocks = new Map(group.stocks.map(stock => [code(stock.symbol || stock.code), stock]))
      stocks.delete('')
      const values = [...stocks].map(([symbol, stock]) => quotes.has(symbol) ? quotes.get(symbol) : stock.change_pct)
        .filter((pct): pct is number => typeof pct === 'number' && Number.isFinite(pct))
      return { key: group.key, count: stocks.size, avgPct: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
    }).filter(row => row.count > 0)
  }, [concepts.data, market.data, configs.data])
  const fetchIndustry = useMutation({
    mutationFn: () => api.extDataPresetFetch(INDUSTRY_ID),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: QK.extData })
      await client.invalidateQueries({ queryKey: QK.extDataRows(INDUSTRY_ID, undefined, LIMIT) })
    },
  })
  const rows = useMemo(() => industryHeatRows(industry.data?.rows ?? [], market.data?.rows ?? [], level), [industry.data, market.data, level])
  const controls = <div className="flex shrink-0 flex-wrap gap-1 px-4 pt-3" role="group" aria-label="热力图分类">
    {LABELS.map((label, index) => <button key={label} aria-pressed={level === index} onClick={() => setLevel(index)}
      className={`rounded-btn border px-3 py-1.5 text-xs ${level === index ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border text-secondary hover:bg-elevated'}`}>{label}</button>)}
  </div>
  const emptyContent = <div className="space-y-3 text-center">
    <p>暂无同花顺行业分类数据</p>
    <button disabled={fetchIndustry.isPending} onClick={() => fetchIndustry.mutate()} className="text-accent disabled:opacity-50">
      {fetchIndustry.isPending ? '正在获取行业分类…' : '获取行业分类数据'}
    </button>
    {fetchIndustry.isError && <p role="alert" className="text-danger">获取失败，请重试或前往行业分析页检查数据配置。</p>}
  </div>
  return <Dialog {...props} controls={controls} title="热力图" category={level ? '行业' : '概念'}
    rows={level ? rows : localConcept ? conceptRows : props.rows}
    date={level ? market.data?.as_of ?? industry.data?.date : localConcept ? market.data?.as_of ?? concepts.data?.date : props.date}
    loading={level ? industry.isLoading || market.isLoading : localConcept ? configs.isLoading || concepts.isLoading || market.isLoading : props.loading}
    error={level ? industry.isError || market.isError : localConcept ? configs.isError || concepts.isError || market.isError : props.error}
    onRetry={level ? () => { void industry.refetch(); void market.refetch() } : localConcept ? () => { void configs.refetch(); void concepts.refetch(); void market.refetch() } : props.onRetry}
    emptyContent={level ? emptyContent : undefined} />
}
