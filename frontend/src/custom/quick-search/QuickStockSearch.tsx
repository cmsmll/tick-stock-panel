import { useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { StockPreviewDialog } from '@/components/StockPreviewDialog'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'

type Stock = { symbol: string; name: string }
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="searchbox"]'

export function QuickStockSearch() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const [active, setActive] = useState(0)
  const [preview, setPreview] = useState<Stock | null>(null)
  const [navList, setNavList] = useState<Stock[]>([])
  const input = useRef<HTMLInputElement>(null)

  function show(initial = '') {
    setText(initial); setQuery(''); setActive(0); setComposing(false); setOpen(true)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (open || preview || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
        || event.isComposing || event.keyCode === 229 || event.repeat || !/^[\p{L}\p{N}]$/u.test(event.key)) return
      // Only inspect focus; the extension never mutates a core component's DOM/state.
      const targets = [event.target, document.activeElement]
      if (targets.some(el => el instanceof Element && el.closest(EDITABLE))) return
      if (document.querySelector('[aria-modal="true"], dialog[open]')) return
      event.preventDefault()
      // Focus before the next keystroke, including fast barcode/paste-like typing.
      flushSync(() => show(event.key))
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, preview])

  useEffect(() => {
    if (!open || composing) return
    const timer = window.setTimeout(() => setQuery(text.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [text, open, composing])
  const search = useQuery({
    queryKey: QK.instrumentSearch(query, 'stock'),
    queryFn: () => api.instrumentSearch(query, 20, 'stock'),
    enabled: open && !!query && !composing,
    staleTime: 60_000,
    retry: false,
  })
  const pending = composing || text.trim() !== query || search.isFetching
  const results = !pending && !search.isError ? search.data?.results ?? [] : []
  function select(stock: Stock) {
    setNavList(results); setOpen(false); setPreview(stock)
  }
  useEffect(() => {
    if (open) document.getElementById(`quick-stock-option-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  return createPortal(<>
      {open && <Modal onClose={() => setOpen(false)} ariaLabel="快捷搜索" initialFocusRef={input}
        overlayClassName="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[12vh] px-4"
        panelClassName="w-full max-w-xl overflow-hidden rounded-card border border-border bg-surface shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={20} className="shrink-0 text-secondary" />
          <input ref={input} value={text} aria-label="股票代码或名称" placeholder="输入股票代码或名称"
            role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="quick-stock-results"
            aria-activedescendant={results[active] ? `quick-stock-option-${active}` : undefined}
            className="min-w-0 flex-1 bg-transparent py-2 text-foreground outline-none" autoComplete="off"
            onChange={e => { setText(e.target.value); setActive(0) }}
            onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || composing) return
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                if (results.length) setActive(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (results[active]) select(results[active])
              }
            }} />
          <button type="button" aria-label="关闭快捷搜索" onClick={() => setOpen(false)} className="p-1 text-secondary hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2" id="quick-stock-results" role="listbox" aria-label="匹配的股票" aria-busy={pending}>
          {results.map((stock, index) => <button type="button" key={stock.symbol} id={`quick-stock-option-${index}`}
            role="option" aria-selected={index === active} tabIndex={-1} onClick={() => select(stock)}
            onMouseEnter={() => setActive(index)}
            className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left ${index === active ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-elevated'}`}>
            <span className="truncate">{stock.name}</span><span className="shrink-0 font-mono text-sm text-secondary">{stock.symbol}</span>
          </button>)}
        </div>
        {!results.length && <div role="status" className="px-5 pb-6 pt-3 text-center text-sm text-secondary">
          {!text.trim() ? '输入代码或名称，查找股票行情' : pending ? '正在搜索…' : search.isError ? <>
            搜索失败，请稍后重试 <button type="button" className="text-accent" onClick={() => void search.refetch()}>重试</button>
          </> : '未找到匹配的股票'}
        </div>}
        <div className="border-t border-border px-4 py-3 text-xs text-muted">↑ ↓ 选择 · Enter 查看行情 · Esc 关闭</div>
      </Modal>}
      <StockPreviewDialog symbol={preview?.symbol ?? null} name={preview?.name} navList={navList}
        onNavigate={(symbol, name) => setPreview({ symbol, name: name ?? '' })} onClose={() => setPreview(null)} />
    </>, document.body)
}
