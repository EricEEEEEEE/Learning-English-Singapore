# T61B 私有素材存储红题

2026-09-26。9例；命令`npm --prefix tests test -- --project=domain t61b-media-store.spec.mjs --max-failures=1` exit1，首例缺lib/private-media-store.ts，8例未运行。日志.loopwork/logs/t61b-media-store-red.log。

测试只用合成非媒体字节：签名身份、账户及版本隔离、并发同内容幂等、禁止覆盖不同内容、hash核验、路径参数和本地损坏检测。返回不暴露本机路径。它不证明音视频可播放、时长、来源许可或组装成功，也不代替T62云端账户课程库。

本轮只读环境搜索未找到PATH及已知runtime内的ffmpeg/ffprobe；不表示机器所有位置均不存在。实际拼接工具准备仍待后续，当前先推进独立素材保存，不把字节存储冒充完整课程。
