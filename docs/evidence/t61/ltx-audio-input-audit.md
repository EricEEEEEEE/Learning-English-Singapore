# T61B LTX 音轨输入核查

2026-09-26 阅读官方当前文档：

- https://docs.ltx.io/input-formats ：audio_uri 支持 HTTPS、供应商上传存储及 Base64 Data URI；音频 Data URI 编码体积上限 15 MB。页面明确 PCM 不支持，列出 MP3/audio-mpeg 与 M4A/AAC-LC 等压缩格式。
- https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video ：音频决定视频时长；fast 在 720p/1080p 下音频最长 20 秒，按输入音频秒数计费。

当前代码事实：generated-audio/assemble-course-audio 生成并拼接 PCM WAV；generated-video 只接受 HTTPS audioUri。此前本地链路使用替身视频 provider，因此没有验证 PCM 在真实 LTX 中可被接受。不能把这部分称为真实供应商输入已接通。

继续开发的最小路线：保留原 PCM 为逐句时间来源；在本地转换为官方明确支持的 MP3 或 AAC-LC/M4A，实际探测编码、时长、起点并解码验证，检查编码延迟和尾部填充。经确认的压缩字节与原分段哈希绑定，听审须针对实际将提交的版本；之后使用 Data URI 传送，约束编码体积，不新增公开素材托管。未完成时不得直接把 PCM 包成 Data URI 发送。

该路线属于已批准的真实适配开发，但新增收费额度仍待落实。当前仅文档核查，没有创建密钥、上传媒体或提交收费请求。历史酒店样片成功不能替代当前 API 格式验证。
