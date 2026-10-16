# T65 · 完整验收运行器维护红阶段

日期：2026-10-16。T65产品行为红档为`8f96e7d7e4`；实现检查点note为`023d8369e9`，均有真实回执。本轮不写产品实现，不把已经通过的产品行为假称重新跑红。

## 调整前实际失败

默认`bash .loopwork/hooks/verify.sh`在300秒退出124：已693项通过，无用例失败，但完整1032项未完成。日志`.loopwork/logs/verify-20261016-130141.log`，失败输出：

> [verify] 考题运行超过 300s 被强制终止——多半卡在交互等待或 watch 模式。

同一最终代码使用临时600秒完整诊断，实际1032/1032通过、失败0、exit0，总耗时306.276秒，见`verify-20261016-131012.log`。这是完整默认验收运行器的时长失败，不能以部分通过、或临时600秒通过替代默认自动绿门。

## 本轮唯一运行器变更

`tests/playwright.config.mjs`：`workers:1`改为`workers:2`。单题20秒、retries0、forbidOnly、三个视口、domain、webServer/reuseExistingServer及固定Chromium配置均不变。无题目、断言、阈值或产品代码改动；默认verify和Stop时限不变。

已先进入`test-writing`。调整前后分别运行`npm --prefix tests run list`：两次exit0，均1032项、97文件，完整输出逐字相同。日志`t65-runner-list-before.log`、`t65-runner-list-after.log`；额外逐字校验配置相对HEAD仅workers1→2，exit0。默认完整verify留待本补充红档真实回执后、回到implementing执行；本轮不声称并行结果已通过。

## 不可放宽的验收

- 原默认完整verify在原300秒内运行全部1032项，失败0且exit0。
- 不加重试、不跳题、不删断言、不扩大时限；并行若暴露共享状态问题须按根因处理。
- 独立只读审查并行结果；Stop自动绿档仍须再跑完整验证。

并行安全预检、风险和回退见`docs/evidence/t65/runner-plan.md`及独立`review.md`。本轮零外部模型调用，不修改hooks、规矩、密钥或生产配置。
