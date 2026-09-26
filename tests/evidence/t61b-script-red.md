# T61B 首个脚本接入切片红题

2026-09-26。16例领域测试，使用合成身份标识与fetch替身，无收费模型调用。

运行：`npm --prefix tests test -- --project=domain t61b-script.spec.mjs --max-failures=1`。
exit 1；首例因`lib/generated-script.ts`不存在而失败，余15例未运行。日志`.loopwork/logs/t61b-script-red.log`。不能把未运行例计为通过。

覆盖：无媒体时间的结构化草稿；五语/来源/角色/ID/回合与句数校验；默认关闭且不相信输入approval；固定模型/输出上限/严格schema/需求作为user数据；超时、HTTP错误、拒绝、incomplete、无效脚本不重试；空与超长需求零请求。

这只是T61B第一切片，不覆盖已承诺的语音、视频、媒体组装、持久运行接线与端到端真实课程；T61B总任务不得据此勾完成。真实计费token门、跨进程预留与运行入口仍须后续测试。

请求格式依据：[OpenAI结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)，2026-09-26核查。schema约束不能代替教学内容与口音听审。
