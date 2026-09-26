# T61B 语音适配与分段红题

2026-09-26，16例。命令`npm --prefix tests test -- --project=domain t61b-audio.spec.mjs --max-failures=1`返回exit1：首例缺lib/generated-audio.ts，15例未运行。日志.loopwork/logs/t61b-audio-red.log。

覆盖默认禁用、两种角色固定声音、实际PCM数据时长与hash、错误响应/超时不重试、非WAV/截断/非法字节率/单句超20秒拒绝，以及按原句顺序分段、总60秒与最多4段。全部音频为合成静音PCM，只证明解析与边界，不证明口音、发音、嘴型或教学效果。

此为内部适配与纯分段函数测试，尚未验证持久语音任务或真实视频调用入口；“在视频提交前拒绝”的端到端接线仍需后续证明。不改原预算，不调用收费API。

复核后补合法未知长度标记流式WAV正例，防止只兼容44字节固定长度头。最终17例，重跑exit1首例仍缺实现，其余16未运行，日志t61b-audio-red-final.log。独立复核未发现必须修正的假通过；其他RIFF块兼容性及实际deadline仍是后续验证项。
