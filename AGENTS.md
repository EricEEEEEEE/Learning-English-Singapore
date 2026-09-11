# Learning English in Singapore —— 本项目由 Loopwork 循环工作法管理

任何会话开始：先读 `.loopwork/state.json`（或跑 `python3 .loopwork/hooks/progress.py card`），
按 loopwork skill 的点火路由续接。不凭记忆猜进度。

铁律指针（完整版在 loopwork skill）：
1. 考题先红后绿；实现期间绝不改 tests/、spec.md、rules.md
2. 勾选不是证据，存档才是——存档不由你执行，你只登记：
   `python3 .loopwork/hooks/progress.py commit red|green|note "存档: …"`，
   轮末钩子验过（密钥筛查 / 只许考题 / verify 全绿）才落 commit 并自动推进基线；
   下一轮看到「[代存档] …已落 <hash>」才算存住，看到「拒绝」就按理由重新登记
3. 花钱/删除/发布/改规矩/密钥 五类动作无条件先问用户
4. 要拍板的事写 BLOCKED.md 跳过，不停机干等
5. 永不宣布「项目完成」，清单空了 = 该续单了
