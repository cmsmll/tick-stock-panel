import { lazy, Suspense, useState } from 'react'
import { Grid2X2 } from 'lucide-react'
import type { ConceptHeatmapProps } from './ConceptHeatmapDialog'

const Dialog = lazy(() => import('./ClassifiedHeatmapDialog'))

export function ConceptHeatmapButton(props: Omit<ConceptHeatmapProps, 'onClose'> & { initialLevel?: 0 | 2 }) {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1 rounded-btn border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20">
      <Grid2X2 className="h-3.5 w-3.5" />热力图
    </button>
    {open && <Suspense fallback={<span role="status" className="text-xs text-muted">加载热力图…</span>}>
      <Dialog {...props} onClose={() => setOpen(false)} />
    </Suspense>}
  </>
}
