# T61B 语音与分段内部检查点

2026-09-26。红档c0ef66f142之后实现lib/generated-audio.ts。目标17/17测试及typecheck exit0；独立静态复核通过。真实模式入口未启用，无收费请求，未读取密钥值。

能力：固定角色声音请求、无自动重试、30秒信号、限制响应体大小、PCM WAV与流式长度解析、实际时长/hash、按句顺序最多4段且每段≤20秒/总≤60秒。不切词、不补静音充时长。

局限：合成静音不证明口音或语音内容；未知长度流式音频在完整采样边界截断时，容器本身无法识别。最终合成后的停顿/编码填充须重新测时长。尚无持久语音阶段、视频适配、课程组装和前端生成入口；T61B仍未完成。

下阶段接口核对：2026-09-26官方原异步文档链接现展示`POST /v2/audio-to-video`，音轨`audio_uri`，显式模型/分辨率/fps，202返回id，查询`GET /v2/audio-to-video/{id}`，完成媒体位于result.video_url。不得凭旧实验字段直接接线，需独立红题验证请求/状态/未知结果。来源：https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video 。未调用该接口。

完整回归：verify.sh exit0，611/611通过（4.4分钟），含类型检查、生产构建、三种视口和领域测试。日志.loopwork/logs/verify-20260926-093115.log。此检查点不作为完整生成或费用控制通过证据；T61B总任务不勾完成，继续下一切片。
