# T61B 本地全链路工程取证

在 61d02b7658 回执后，使用当前实现的转译副本执行 `outputs/t61-http-live/pipeline.mjs`，exit 0。本轮无代码或考题修改。

与此前 HTTP fixture 实验不同，本次没有直接改数据库状态。依次调用 create、runScript、逐句 runAudio、assembleAudio、两次 runVideo/collectVideo/probeVideo、assembleVideo、getCourse/getCourseMedia；每个阶段通过任务存储正常推进。

脚本是两句合成对白，每句语音为 12 秒合成静音 PCM。视频 provider 与下载为注入替身，返回两份已有酒店样片；ffprobe、ffmpeg 拼接与最终全片解码均实际执行。结果：

- 两段私有视频正常保存并验证，最终 video_assembled。
- 成片时长 24.084 秒，SHA-256 为 608e6efe124792cc3bb51992c4398b2729c77701dd933f874ff001dfd1a2990c。
- 句子时间为 0–12 秒、12.042–24.042 秒，按实测视频偏移衔接。
- 重开存储后可读取同版课程及哈希一致的成片；再次 assembleVideo 返回相同结果，模拟提交仍为两次。
- 另一合成账号读取课程被拒绝。

结构化结果保存在 `outputs/t61-http-live/pipeline-result.json`。无真实模型请求、实际费用为零。此实验验证工程状态流和真实媒体工具接线，不证明合成台词与酒店画面匹配、学习质量或新场景生成能力。

剩余真实接入条件：生产 runner 的费用预留与限制、听审结果绑定具体音轨、LTX 可访问的音轨传输方式、实际供应商请求与费用证据。当前 runner 仍 simulation-only；T61B 继续保持未完成。
