# 全局股票快捷搜索

L2 独立前端扩展，基于 commit `fa420051cd51278b10bbc80572a2d64d727f4ccb`，通过 API v1 的 `layout.navigation.extra` 自动挂载，无需修改 Layout、路由或后端。

- 非编辑区域输入字母、数字或文字时打开搜索并保留首字符；输入框、可编辑区域、组合键、输入法组合过程及其他模态对话框内不触发。
- 菜单栏不显示入口，仅通过键盘唤起；弹出后可使用中文输入法。支持鼠标选择、上下键、Enter、Esc。
- 复用 `api.instrumentSearch`、`QK.instrumentSearch` 和看板的 `StockPreviewDialog`；选中后直接打开个股行情，不改变当前页面路由。
- 180ms 防抖，仅查询股票；关闭后不发起搜索。输入变化时隐藏旧结果，防止误选。
- 无持久化配置、后端数据或 API 变更。升级时保留本目录并复核上述插槽、API 和组件 props；移出本目录并重新构建即可卸载。

验证：在 frontend 目录运行 `pnpm exec vitest run src/custom/quick-search/QuickStockSearch.test.tsx` 和 `pnpm build`。手工检查桌面/窄屏唤起、中文输入、编辑区域避让、空结果、失败重试及行情打开。
