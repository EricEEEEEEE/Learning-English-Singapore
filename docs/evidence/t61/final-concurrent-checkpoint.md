# T61B 成片并发执行修复

红档 26a50e5fab 后增加 SQLite final_assembly_locks。BEGIN IMMEDIATE 中核对任务快照并登记任务、归属、随机 token 与 PID；仍存活或无法确定死亡的执行者阻止第二次组装。只有 ESRCH 才回收遗留标记。拼接、验证、保存和发布放在 try/finally 内，释放时按任务、归属及 token 精确删除。

之前两个存储实例重叠执行导致 concat、verify 各两次；修复后各一次。该考题与全部 T61B 领域共 182 项通过，typecheck/diff 通过。日志 `.loopwork/logs/t61b-final-concurrent-green.log`、`t61b-final-concurrent-typecheck.log`。本轮未跑完整 verify。

只读静态审查无当前限定范围阻断。PID 复用会保守阻塞；数据库释放失败可能保留锁，进程仍存活时不会强制接管。真实进程崩溃回收、释放失败及保存失败后重试仍需专项考题。该实现用于当前本机存储，不声称分布式锁或多机部署能力。本轮无收费、部署、规则或既有考题断言变更。
