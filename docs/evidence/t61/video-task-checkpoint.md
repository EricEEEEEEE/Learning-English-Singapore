# T61B 首段视频任务检查点

红档 `75b6dc3920` 后实现内部 `runVideo/queryVideo`。本切片仅首段；后续分段、下载与完整媒体检查尚未接通，不宣称完整视频编排。

- 仅simulation模式、服务端听审标记启用时允许提交。从当前用户私有素材读取已组装首段，核对哈希和真实WAV时长，忽略客户端媒体地址及需求覆盖。
- SQLite事务先检查状态并累计预留、调用次数，后调用替身。成功保存job ID；未知结果保留预留，禁止重投。
- 查询仅使用已存job ID；查询错误不改状态、不触发生成。终态保留，processing不被较晚返回的pending覆盖。
- 供应商completed仅记在job中，任务仍为video_pending，不发布课程ready。签名URL不存入该任务。

验证：新增4项及相关回归共30项通过、exit 0，typecheck和diff检查通过。日志 `.loopwork/logs/t61b-video-task-green.log`、`t61b-video-task-typecheck.log`。本轮未跑完整verify。

边界：听审标记目前是内部配置，不是绑定音轨版本的持久审批；预留不是供应商费用硬上限。尚未提供安全上传地址与真实provider绑定、后续分段提交、视频下载组装及独立进程崩溃证据。不能开放收费路径。无真实上传或付费调用，T61B仍未完成。
