# T61B 组装音轨持久接线

红档 `4d94dde49b` 后实现 `generation-tasks.ts` 的 `assembleAudio`。仅内部simulation模式可用，无网络请求。

读取任务归属者的同任务、同版本私有素材，核对台词顺序、角色及来源哈希，再以实际PCM组装分段和计算字幕时间。所有分段保存成功后才将引用及时间写入SQLite，并置为`audio_assembled`。任务不存音频字节，不增加供应商调用数或预留金额。

缺少源素材、校验或写入失败时不发布完成状态；本地不可变素材允许重复组装复用，最终事务检查任务状态和来源引用，避免覆盖并发变化。局部文件已落盘但任务未发布时可能有未引用资产；不代表跨文件与数据库的原子事务，也不保证断电恢复。

验证：新增3项与音轨/脚本相关回归合计18项通过（exit 0）；typecheck、diff检查通过。日志 `.loopwork/logs/t61b-assembly-task-green.log`、`t61b-assembly-task-typecheck.log`。本轮没有重跑完整verify，不将上一轮659项结果当成本轮结果。

下一步仍需视频输入的安全可访问音轨、听审和费用门，以及持久视频提交/查询。`audio_assembled`不是完整课程ready，T61B不勾完成。本轮无新增费用。
