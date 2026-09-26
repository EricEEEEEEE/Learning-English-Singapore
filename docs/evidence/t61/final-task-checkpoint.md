# T61B 成片持久接线检查点

红档 b748382c0e 后为 generation-tasks 增加 assembleVideo，仅允许 simulation 模式和服务器注入依赖。读取本人同版本全部完成的视频任务、素材与探测记录，核对实际存储字节哈希，按探测时长规划字幕时间轴，再拼接并验证最终字节。最终文件私有保存成功后，事务核对来源快照并发布 finalVideo、videoTimeline 和 video_assembled 状态；不标记课程 ready。

重开后再次调用会核对已有私有文件并返回，不重复拼接、不增加 providerCalls 或 reservedMicros。校验失败、缺片段、未探测片段、非本人操作均不发布最终引用。

验证：4 项新考题及 2 项多段回归通过；全部 T61B 领域回归 156 项通过（exit 0），typecheck 和 git diff --check 通过。日志为 `.loopwork/logs/t61b-final-task-green.log`、`t61b-final-task-regression.log`、`t61b-final-task-typecheck.log`。此次接线测试使用合成字节及注入执行器，不是新生成视频。上一检查点的 723 项全量通过早于此次修改，本次未重跑全量。

只读审查未发现限定切片阻断。边界：并发调用可能重复本地拼接/解码；保存完成但 CAS 失败可能留下未引用私有文件。并发交错、保存失败与保存后损坏仍需专项覆盖。尚未连接真实收费生成、课程发布和前端播放入口；不构成完整 T61B 验收，无新增 API 费用。
