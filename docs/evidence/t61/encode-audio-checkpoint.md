# T61B 本地 AAC 音轨编码检查点

红档 a170e6a463 后新增 encode-video-audio：核对 PCM 字节哈希和源时长，私有临时目录内以可信 FFmpeg 编为 AAC-LC/M4A，ffprobe 检查单音轨、零起点、编码与时长，再完整解码。返回源/输出哈希与实测时长。输出超过20秒、时长差超过一个AAC帧及舍入、错误输出或清理失败均拒绝；不截断补齐。

188项 T61B 领域回归及 typecheck/diff 通过。审查提出临时目录创建错误可能含路径，已改为通用错误，随后6项编码器题重跑通过。日志 t61b-encode-audio-green.log、t61b-encode-audio-typecheck.log、t61b-encode-audio-final.log。本轮未全量verify。

真实本地工具实验均exit0：12秒静音PCM→12秒AAC，3107字节；已有酒店人声解码为PCM后，源11.989333333秒→11.99秒AAC，46255字节，两者均通过探测和全片解码。结果位于 outputs/t61-http-live/encode-result.json 与 hotel-encode-result.json，音频保留本地。没有上传或收费请求。

只读审查未发现阻断。20秒边界编码稍长仍会保守拒绝，不以截断绕过；解码和时长合格不等于听感、口音或音质通过。尚未接入持久音轨记录、听审绑定或LTX Data URI提交，不能声称供应商已接受实际输入。
