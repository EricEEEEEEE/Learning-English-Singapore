# T61B 编码视频查询与私有收集检查点

红档 25a0b98f91 后，queryVideo/collectVideo 按持久视频任务的 audioSha256 是否存在选择 encodedVideoProvider 或 legacy videoProvider；对应 query 缺失立即拒绝，不回退。保留会话归属、job ID、状态单向推进、临时地址不持久化以及私有素材完整性校验。

新增两题通过：重开后正确查询并私有保存一次，调用计数和费用预留不增加；缺编码查询接口时不调用 legacy，也不改变任务。全部 T61B 领域 211 passed（3.5s），typecheck exit 0，diff 检查通过。日志 t61b-encoded-retrieval-green.log 与 t61b-encoded-retrieval-types.log。本检查点未重跑完整 verify；前一检查点完整回归为 786 项，不能当作本版本全量结果。

只读静态复核无阻断。已收集素材仍先要求 query 配置存在，属于保守限制；供应商选择依赖可信任务数据库。仅内部 simulation 接线，无真实付费调用。下一项是把视频探测时长绑定到实际提交的 AAC，T61B 未完成。
