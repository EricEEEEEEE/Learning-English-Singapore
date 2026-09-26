# T61B 同版课程数据检查点

红档 a6efa67a7c 后新增 `lib/generated-course.ts`，将服务器任务内已验证脚本、实测字幕时间和最终私有素材引用投影为课程数据。课程、每句及素材引用携带同一 revision；保留五语释义、短语和对话配对。输出不含 owner、费用和供应商信息，不生成公开媒体 URL。模拟任务明确标为 test-fixture。

12 项新题及全部 T61B 领域回归合计 168 项通过（exit 0）；typecheck、diff 检查通过。日志：`.loopwork/logs/t61b-course-manifest-green.log`、`t61b-course-manifest-typecheck.log`。本轮未重跑全量 verify；上一轮全量结果不能替代当前全量结果。

本模块只接受服务器内部任务，不承担鉴权、素材文件读取或持久保存；媒体引用本身不授予访问权限。尚未接到课程读取接口和学习页面，不代表用户已能播放新生成课程。只验证数据一致性，不证明翻译、口音或对白教学质量。无付费调用。
