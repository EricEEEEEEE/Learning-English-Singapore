# T41 红阶段证据

- 需求：辅助语言移除 English，新增 한국어与 हिन्दी；品牌旁显示“帮你融入新加坡，相信自己可以做到。”。
- 2026-09-13 初次在 phone 项目运行 `tests/e2e/t41-language-brand.spec.mjs`：5/5 失败，exit 1。
- 失败原因与需求一一对应：缺少 한국어、缺少 हिन्दी、仍有 English 选项、缺少 slogan、旧 `en` 偏好无法按新合同迁移。
- 第一轮独立审题退回：历史 T02–T06 与新合同冲突，且缺少画像／场景／听练／大字覆盖。
- 修正：历史考题不再把 English 当辅助语言；新增 2 个实例，覆盖两种新语言贯穿画像、场景、准备、听练、刷新恢复，以及移动端大字、控件边界和最小触控尺寸；slogan 限定在 `banner` 内。
- 修正后运行 `npm --prefix tests test -- e2e/t41-language-brand.spec.mjs --project=small-phone --reporter=line`：7/7 失败，exit 1。七项均在现有产品缺少 한국어／हिन्दी 或 slogan 的第一处断言失败；原始失败截图、上下文与 trace 位于 `test-results/e2e-t41-language-brand-*`。
- 本阶段未实现产品代码；考题保持真实红，待独立复审通过后登记红存档。
