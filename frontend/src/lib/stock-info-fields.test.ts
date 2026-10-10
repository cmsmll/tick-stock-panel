// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { BUILTIN_INFO_FIELDS, INFO_GROUPS, loadInfoFields, saveInfoFields } from './stock-info-fields'

it('旧信息条配置自动补齐股息率，保持已有选择和默认隐藏', () => {
  const old = BUILTIN_INFO_FIELDS.filter(f => f.id !== 'builtin:dividend_yield')
    .map(f => ({ ...f, visible: f.id === 'builtin:eps' }))
  saveInfoFields(old)
  const merged = loadInfoFields()
  expect(merged.find(f => f.id === 'builtin:eps')?.visible).toBe(true)
  const field = merged.find(f => f.id === 'builtin:dividend_yield')!
  expect(field.visible).toBe(false)
  expect(INFO_GROUPS.find(g => g.id === 'finance')?.keys).toContain('dividend_yield')
  saveInfoFields(merged.map(f => f.id === field.id ? { ...f, visible: true } : f))
  expect(loadInfoFields().find(f => f.id === field.id)?.visible).toBe(true)
  localStorage.clear()
})
