import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import * as echarts from 'echarts'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { fmtPct } from '@/lib/format'

export interface ConceptHeatmapRow {
  key: string
  count: number
  /** 成分股有效涨跌幅的算术平均，小数制，与概念分析页一致。 */
  avgPct: number | null
}
export interface ConceptHeatmapProps {
  rows: ConceptHeatmapRow[]
  date?: string | null
  loading: boolean
  error: boolean
  onRetry: () => void
  onClose: () => void
  title?: string
  category?: string
  controls?: ReactNode
  emptyContent?: ReactNode
}

export function heatColor(pct: number | null) {
  if (pct == null || !Number.isFinite(pct)) return '#475569'
  if (pct === 0) return '#52525b'
  const strength = Math.min(Math.abs(pct) / 0.05, 1)
  return pct > 0 ? `rgb(${Math.round(110 + strength * 110)}, 38, 38)`
    : `rgb(20, ${Math.round(85 + strength * 75)}, 65)`
}

export function heatData(rows: ConceptHeatmapRow[]) {
  return rows.filter(row => Number.isFinite(row.count) && row.count > 0).map(row => ({
    name: row.key,
    value: row.count,
    change: row.avgPct != null && Number.isFinite(row.avgPct) ? fmtPct(row.avgPct) : '暂无行情',
    itemStyle: { color: heatColor(row.avgPct) },
  }))
}

function HeatmapChart({ rows }: { rows: ConceptHeatmapRow[] }) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  useEffect(() => {
    const element = host.current!
    const instance = echarts.init(element)
    chart.current = instance
    const observer = new ResizeObserver(() => {
      instance.resize()
      // Treemap retains its previous root rectangle on resize; rebuild to fit every tile.
      const option = instance.getOption()
      if (option.series) instance.setOption(option, true)
    })
    observer.observe(element)
    return () => { observer.disconnect(); instance.dispose(); chart.current = null }
  }, [])
  useEffect(() => {
    const data = heatData(rows)
    chart.current?.setOption({
      animation: false,
      tooltip: {
        renderMode: 'richText',
        confine: true,
        formatter: (params: unknown) => {
          const point = (params as { data: typeof data[number] }).data
          return `${point.name}\n成分股：${point.value} 只\n平均涨跌幅：${point.change}`
        },
      },
      series: [{
        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
        left: 0, right: 0, top: 0, bottom: 0, visibleMin: 0,
        label: {
          show: true, color: '#fff', fontSize: 12, overflow: 'truncate',
          formatter: (params: unknown) => {
            const point = (params as { data: typeof data[number] }).data
            return `${point.name}\n${point.change}`
          },
        },
        itemStyle: { borderColor: '#18181b', borderWidth: 1, gapWidth: 1 },
        emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2 } },
        data,
      }],
    }, true)
  }, [rows])
  return <div ref={host} role="img" aria-label="板块热力图，色块面积表示成分股数量，红涨绿跌，悬停查看明细" className="h-full w-full" />
}

export default function ConceptHeatmapDialog({ rows, date, loading, error, onRetry, onClose, title = '概念热力图', category = '概念', controls, emptyContent }: ConceptHeatmapProps) {
  const [maximized, setMaximized] = useState(false)
  return createPortal(<Modal onClose={onClose} ariaLabel={title}
    overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    panelClassName={`flex flex-col overflow-hidden border border-border bg-surface shadow-xl ${maximized ? 'h-[100dvh] w-screen' : 'h-[82dvh] w-[94vw] max-w-[1600px] rounded-dialog'}`}>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div><h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted">{date ?? '最新'} · {rows.length} 个{category}</p></div>
      <div className="flex items-center gap-2">
        <button aria-label={maximized ? '还原热力图' : '最大化热力图'} title={maximized ? '还原' : '最大化'} onClick={() => setMaximized(v => !v)} className="rounded-btn p-2 text-secondary hover:bg-elevated">
          {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button aria-label="关闭热力图" onClick={onClose} className="rounded-btn p-2 text-secondary hover:bg-elevated"><X size={18} /></button>
      </div>
    </div>
    {controls}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs text-secondary">
      <span>面积：成分股数量 · 颜色：平均涨跌幅</span>
      <span><span className="text-bull">■ 上涨</span>　<span className="text-bear">■ 下跌</span>　<span className="text-muted">■ 平盘 / 无行情</span></span>
      <span>颜色越鲜明，涨跌幅越大；悬停查看明细</span>
    </div>
    <div className="min-h-0 flex-1 p-3 pt-0">
      {loading ? <div role="status" className="flex h-full items-center justify-center text-sm text-muted">正在加载{category}行情…</div>
        : error ? <div role="alert" className="flex h-full items-center justify-center gap-3 text-sm text-danger">{category}行情加载失败<button onClick={onRetry} className="text-accent">重试</button></div>
        : rows.length === 0 ? <div role="status" className="flex h-full items-center justify-center text-sm text-muted">{emptyContent ?? `暂无${category}数据`}</div>
        : <HeatmapChart rows={rows} />}
    </div>
  </Modal>, document.body)
}
