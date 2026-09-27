# T61B 总预留路径运行取证

执行 `node docs/evidence/t61/budget-paths-check.mjs` exit 0。当前lib转译后在隔离临时SQLite、合成身份与供应商替身上运行。结果 outputs/t61-budget-evidence/result.json，日志 .loopwork/logs/t61b-budget-paths-evidence.log。

- 语音：脚本预留100微美元，语音200，300总限额精确放行；再调用拒绝且任务未改变。
- 重开省略限额配置：沿用持久300，不能绕过；改成1000时因配置冲突拒绝。
- 编码视频：已有脚本/语音预留500，视频预留90000；90499限额拒绝且供应商调用0，90500精确放行一次。
- runSimulation：同库另一任务也不能越过已用满的限额，供应商调用0。

全部是合成微美元计数，不是新费用授权或真实账单；真实API调用0。首次未保存限额且省略配置的离线兼容模式仍存在，真实入口必须禁用该模式。这份取证不声称跨数据库、供应商结算或进程外调用已有硬上限。

当前完整验证：verify.sh exit 0，796 passed（4.6m），包含类型检查、生产构建与全套浏览器/领域测试；日志 `.loopwork/logs/verify-20260927-122559.log` 和 `t61b-budget-full-verify.log`。本轮仅取证脚本与文档对账，无实现变更，不将整个T61B标为完成。
