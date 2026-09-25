# 当前方案文档核对（2026-09-25）

结论：核心产品方向已同步，但本次发现当前执行状态存在滞后，已修正。不能把历史材料全部改成当前完成状态。

| 文档 | 核对结果/处理 |
| --- | --- |
| PROJECT.md | 已写5–8分钟与五步、账号复学及未完成边界，无需改需求 |
| spec.md | v0.4 J1–J6完整覆盖新需求；旧v0.2/v0.3明确低优先级，保持原证据 |
| rules.md | 已写场景优先、口音尊重、沉默等待与费用边界，不新增规则 |
| plan.md | 修复“只执行T60”及T61A尚未开始的过期当前描述，转T61P |
| tasks.md | T60/T61A绿档可追溯；新增本次准备交付T61P及T61B/T62/T63/T64候选依赖 |
| README.md | 更新最新571项验证，保留12秒媒体与未实现能力边界 |
| docs/current-product-baseline.md | 更新数据驱动、任务管线真实状态与当前准备入口 |
| docs/five-step-learning-flow.md | 全部五步及第五步自由回答已对应需求；不把固定触发当AI理解 |
| docs/acceptance-map.md | 新增当前J1–J6至T60–T64映射，旧T54–T58明确历史用途 |
| docs/proposals/scene-generation-integration.md | 修复“无任务路由”过期描述，链接本次短课包 |
| BLOCKED.md | 当前费用边界与准备包置顶，历史T53/T54不作为当前顺序 |

其余plan相关历史材料：docs/planning-review.md、docs/planning-qa.json和旧离线批次proposal是原日期评审/实验依据；docs/second-cycle-document-audit.md列出的旧材料已有历史说明。本次不追改证据、测试或历史费用，不删除旧方案。

Loopwork执行链：读取state → tasks顶部当前授权批次 → plan依赖 → spec J1–J6考题 → 红档 → 实现 → verify → 绿档回执。T60绿档6ed1da5400、T61A绿档cba8fcedc2证明最近两轮按新主线推进；T61P为文档准备，不伪造实现绿档。历史测试继续回归，但不决定新产品路线。

文档与产品不能混为一谈：新逻辑已成为当前执行依据；完整5–8分钟、任意需求真实生成、第五步自由对话和账户课程持久保存仍未交付。准备包的费用未知项已明示，不能视作可以立即付费执行。
