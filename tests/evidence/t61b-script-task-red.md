# T61B 持久脚本接线红题

2026-09-26。7例；最终运行`npm --prefix tests test -- --project=domain t61b-script-task.spec.mjs --max-failures=1` exit1，首例`store.runScript is not a function`，余6例未运行。日志.loopwork/logs/t61b-script-task-red-final.log。

包含：无provider禁用；非模拟模式即使注入provider及输入approval也零调用；已存需求传入真实脚本适配器（HTTP替身）并持久保存校验后草稿；账户隔离；预留先落盘与并发拒绝；超时/无效草稿保留预留并阻止重试；角色校验回归。

只读复核要求已补非simulation禁用及并发提前拒绝传播。reopen是存储实例重建，不冒充新独立进程重启测试；原T61A独立进程证据不能自动覆盖新的脚本路径。本切片仍不包含真实收费、媒体生成或完整T61B验收。
