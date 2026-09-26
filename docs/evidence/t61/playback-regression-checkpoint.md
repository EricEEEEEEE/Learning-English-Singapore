# T61B 播放接线累计回归

在 8b96cb52f5 回执后，本轮未修改实现或考题，执行完整 verify.sh：exit 0，758 项通过（4.5 分钟）。日志 `.loopwork/logs/verify-20260926-111838.log`，汇总 `.loopwork/logs/t61b-playback-full.log`。

验证器报“只碰考题”的启发式预警；实际核查 git diff --name-only 仅为 .loopwork/state.json，tests/、spec.md、rules.md 均无差异。实现与考题已在前序独立红档和记事档入库；本轮仅重跑验证，没有放松断言或调整测试。

真实本地 HTTP 检查：默认测试配置返回 503 local_setup_required。另开使用合成会话密钥的本地服务后，未登录的课程数据 GET、媒体 GET+Range 及 HEAD+Range 均返回 401，带 private/no-store；媒体错误不含 Content-Range，HEAD 无正文。媒体原始响应保存在 `.loopwork/logs/t61b-http-media-get.txt` 和 `t61b-http-media-head.txt`。初次 Python 请求被沙箱 EPERM 阻止，后续受控本地 curl 验证成功，临时服务已停止。

这证明未授权访问边界，不证明真实已登录账号完整播放。浏览器三视口播放仍使用合成接口和既有样片。T61B 真实收费链路、完整课程生成和已登录 HTTP 播放验收尚未完成，不勾选任务，不登记整体绿档。本轮没有 API 费用、部署或密钥读取。
