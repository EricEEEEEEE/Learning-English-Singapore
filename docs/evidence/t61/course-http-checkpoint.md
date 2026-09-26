# T61B 课程数据 HTTP 检查点

红档 5dce766f7d 后增加 GET `/api/generated-courses?id=...&revision=...`。参数必须为单个有效 ID 与正整数版本，读取传入签名会话，由私有任务存储验签并核对归属。业务响应统一 private/no-store，内部异常脱敏。真实入口使用 `tmp/generation-tasks` 和其 media 子目录；没有配置生成 provider。缺本地会话密钥或 Vercel 环境返回未就绪，不将临时云磁盘当持久存储。

4 项 HTTP handler 考题及全部 T61B 领域回归合计 175 项通过，typecheck、生产构建、diff 检查通过；构建产物包含该动态路由。日志：`.loopwork/logs/t61b-course-http-green.log`、`t61b-course-http-typecheck.log`、`t61b-course-http-build.log`。本轮未跑完整 verify。

只读静态审查无阻断。尚未做真实 HTTP 会话隔离及框架非 GET 响应的端到端测试；handler 替身测试不替代此验证。视频字节路由和学习页面接线仍待完成。没有发布或付费调用。
