import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { QK } from './queryKeys'
import { useCapabilityMatrix } from './useSharedQueries'

/** 分红历史与信息条共享路由门控、查询键及缓存。 */
export function useDividends(symbol: string) {
  const matrix = useCapabilityMatrix()
  const route = matrix.data?.capabilities.find(cap => cap.id === 'dividends')
  const history = useQuery({
    queryKey: QK.dividends(symbol, route?.effective ?? '', matrix.dataUpdatedAt),
    queryFn: () => api.dividendHistory(symbol),
    enabled: !!symbol && !!route?.usable,
    staleTime: 300_000,
    retry: false,
  })
  return { matrix, route, history }
}
