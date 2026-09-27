# T61B 同库总预留限制检查点

红档 d16122ac30 后，createGenerationTaskStore支持内部maxReservedMicros。四条提交路径（脚本、语音、视频、runSimulation）在同一BEGIN IMMEDIATE事务中检查同库所有任务reservedMicros总和，再保存本次预留。验证金额为安全整数、拒绝负值/溢出/超限。结果未知的预留不释放。

首次成功预留同事务固化限额；之后配置冲突拒绝，省略配置沿用已保存限额。首次成功预留前没有配置时仍保留旧离线兼容路径；零额度拒绝调用，但失败事务不会固化新配置。此限制不是供应商账单硬上限，也不覆盖其他数据库或外部调用。真实runner仍关闭。

新5项红转绿，T61B领域219 passed（3.7s），typecheck exit0，diff检查通过。日志t61b-total-reservation-green.log、t61b-total-reservation-types.log。只读静态复核无离线范围阻断。本轮未重跑完整verify。新题覆盖脚本并发、未知提交占用和重开、非法/零额度；语音/视频同闸门的精确边界、配置省略/冲突仍需补运行证据。

无真实付费调用，不修改既有25美元授权范围。后续真实入口必须强制已落实的金额、供应商费用上界证据和预留闸门，不沿用缺配置的离线兼容模式。
