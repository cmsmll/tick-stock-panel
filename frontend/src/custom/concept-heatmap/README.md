# 概念矩形热力图

基线：7060392。独立组件放在本目录；当前没有概念页工具栏插槽，因此仅在 ConceptAnalysis.tsx 增加导入与按钮接线（L3 最小接入）。

支持概念、一级行业、二级行业、三级行业切换。概念复用页面 stats；行业按需读取同花顺预设 ext_hy_ths，复用 extDataRows 和 marketSnapshot 查询缓存，不新增后端 API。空数据时提供现有预设获取接口入口，获取后刷新共享缓存。切换分类不改变行业分析页配置或弹窗最大化状态。

色块面积为去重后的成分股数量；颜色使用有效成分股涨跌幅的算术平均（小数制）；缺行情显示灰色，不作为零涨跌。缺失行业层级归入未分类，不用其他层级替代。概念成员可能重叠，面积不表示全市场独占权重。

弹窗按需加载 ECharts，ResizeObserver 处理最大化/还原，关闭时释放图表。升级时复核 ConceptAnalysis 的接线及 stats 的 count/avgPct 口径。

验证：pnpm exec vitest run src/custom/concept-heatmap/ConceptHeatmapDialog.test.tsx；pnpm build。浏览器检查桌面、窄屏、最大化/还原与 Esc 关闭。

入口：概念分析默认概念，行业分析默认二级行业；每次打开恢复入口默认分类，标题统一为热力图。行业入口切换概念时按需读取 ext_gn_ths 与共享行情缓存。
