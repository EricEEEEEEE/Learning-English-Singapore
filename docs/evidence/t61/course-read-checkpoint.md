# T61B 私有课程读取检查点

红档 3cae1cf218 后在 generation-tasks 增加 getCourse/getCourseMedia。两者共用读取逻辑：先验证签名会话，再按本人读取任务、核对明确的 revision，构建严格课程数据，最后从同一课程版本私有存储读取成片并核对 size、SHA-256 与实际字节。仅返回课程数据或素材，不触发生成或更新费用。

新考题覆盖本人重开读取、无生成副作用、跨账号/无会话/过期会话拒绝、未完成和错误版本拒绝。全部 T61B 领域 171 项通过（exit 0），typecheck 和 diff 检查通过。日志：`.loopwork/logs/t61b-course-read-green.log`、`t61b-course-read-typecheck.log`。本次未跑完整 verify。

仍是内部服务器方法，尚无 HTTP 读取路由和前端播放器接线。课程元数据读取目前也读取并哈希整个成片；这支持当前本地短课实验，不是大视频的优化方案。素材损坏/读取失败专项集成题仍待补。本轮无付费调用。
