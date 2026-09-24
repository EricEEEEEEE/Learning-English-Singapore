# T59 四页真实样片红考题

2026-09-24。只新增考题，未改实现。

- `npm --prefix tests run list -- --project=desktop e2e/t59-real-scene.spec.mjs`：exit 0，7例；配置会在小手机、手机、桌面运行同组用例。
- 初次启动被沙箱端口EPERM阻止，不计作功能红；批准本地服务器执行权限后重跑。
- 最终 `npm --prefix tests test -- --project=desktop e2e/t59-real-scene.spec.mjs --max-failures=1`：exit 1，1 failed / 6 did not run。失败为语言选择后找不到`real-scene-entry`，不是服务器启动失败。完整本地日志 `.loopwork/logs/t59-red-final.log`；最大失败数停止信息不是另一个业务失败。
- 考题覆盖：原视频解码/英文字幕/重播，五语词句同源及四页重复导航，分段播放窗口、答案自然结束、切页及离开停止、浏览器请求无外部模型请求。
- 独立复核指出片段边界不足，冻结前已补首次原音与回答窗口、自然结束和退出停止。
- 自动化不能证明人耳可听正确声音、翻译准确或服务端完全无付费调用；实现后另做原媒体核验、人工听审及服务端代码审查。当前未声称七例均已执行或功能完成。
