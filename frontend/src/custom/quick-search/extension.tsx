import type { FrontendExtension } from '@/extensions/types'
import { QuickStockSearch } from './QuickStockSearch'

const extension: FrontendExtension = {
  id: 'custom.quick-search',
  apiVersion: 1,
  slots: [{ name: 'layout.navigation.extra', id: 'quick-stock-search', order: 20,
    component: QuickStockSearch }],
}
export default extension
