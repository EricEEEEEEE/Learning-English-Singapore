# 调研报告 #2 · 口语对练的语音技术（VAD、轮流说话、ASR、TTS、发音反馈、移动端音频）

调研日期：2026-10-18。对象：仓库 `codex/ai-handoff-20261016` 分支，重点读了 `app/scene-practice.tsx`、`lib/practice-turn.ts`、`lib/practice-providers.ts`、`lib/live-practice.ts`、`lib/generated-audio.ts`，以及 HANDOFF.md、spec.md、first-version-audit.md 和 tasks.md 的 C4–C9。只读，没有改仓库。

标注方式：**〔实测〕** 是我本次亲自取到的数据，比如 npm 和 CDN 文件大小、仓库代码；**〔文档〕** 来自 README 或官方文档；**〔推断〕** 是我的判断，还没验证。价格以 OpenAI 和 Azure 当前官网为准。这次会话打不开 openai.com 定价页，表里的价格来自第三方转引和我已有的知识，**上线前必须再核一遍**。

---

## 1. 结论摘要

- **最值得先做的是一个零费用的小改动：录音结束后先在浏览器里判断有没有人声，没有就不发送。**现在每次录音都会先预留费用，再调用转写（`practice-turn.ts` 的 `reserve()` 在 `transcribe` 之前）。静音回合会被记成 `silence`，但照样计入每课 20 回合的上限（`count(*)` 不分状态）。另外，gpt-4o 系列转写在静音或很短的录音上有“幻听”的社区报告。怕开口的近零基础学习者，最常见的情况恰恰就是“按了没说”。
- **保持“点一下开始说”的现有方式。**再加一个可选的“说完自动结束”，用浏览器端 Silero VAD（`@ricky0123/vad-web`），但只在学习者打开开关时才加载。默认不做全自动免按键对话，也不做打断（barge-in）。理由是 spec 的 F7/F8 要求“准备好才开麦、会等、不抢话”，全自动轮流说话和这一点有冲突。
- **单回合的真实成本约 USD 0.002–0.004〔推断，按公开单价估算〕，现在每回合预留 USD 0.03（`PRACTICE_TURN_MICROS=30000`），留了大约 10 倍余量。**这是安全上限，不是浪费。但如果以后想放宽每课 20 回合的限制，有空间。
- **对方回答的音频现在是 WAV 格式，转成 base64 塞在 JSON 里返回。**一句 4 秒的回答大约 250KB〔推断，按 24kHz/16bit 计算〕。改成 mp3 或 aac 能小将近 10 倍，弱网和微信里会明显快一些，模型费用不变。
- **口音和转写准确率：目前没有任何“新加坡英语 / 非母语学习者”上的实测数据。**公开研究显示，Whisper 系列对非母语口音的错误率更高。新加坡本地的 MERaLiON-2-10B-ASR 自称在新加坡语言上比 whisper-large-v3 好 5–30%，但它需要 GPU 自建，成本远超现阶段规模。建议先花不到 1 美元，做一个 30–50 段的小评测集，再决定要不要换模型。
- **英语回合固定传 `language='en'` 有一个隐患：**学习者中途夹几句中文时，Whisper 系列可能会把中文直接“翻译”成英语输出，让人误以为他说的是英语。这会把回顾里的“独立完成”记错。属于〔推断〕，有论文报告了同类现象，需要在评测集里专门测。
- **发音反馈：继续坚持“不按转写文字评发音、不打口音分”。**代码已经过滤掉“谈发音”的教练提示。可以零成本加一个“听自己刚才说的 / 再听示范”的对比回放：由学习者自己判断，不由机器下结论。
- **iOS Safari 和微信内置浏览器是最大的未知项，至今没有真机测试过**（audit F13.4）。已知风险有三类：异步拿到回答后 `play()` 可能被自动播放策略拒绝（代码里 `.catch(() => {})` 把失败吞掉了，什么提示都没有）；每回合都重新 `getUserMedia`，可能反复弹出权限框；部分 WKWebView 里的 `getUserMedia` 永远不返回。

## 2. 调研到的项目和资源

星数和活跃日期取自 2026-10-18 通过 GitHub 搜索拿到的数据。“最后活跃”优先用 pushed_at，否则用 updated_at。许可证后面标“（未核）”的，是凭记忆写的，没有核对仓库。

| 名称 | 链接 | Stars | 最后活跃 | 许可证 | 和我们的关系 |
|---|---|---|---|---|---|
| ricky0123/vad（`@ricky0123/vad-web`） | https://github.com/ricky0123/vad | 2068 | 2026-09-12 | ISC（npm 0.0.31 实测） | 浏览器端 Silero VAD，提供 `MicVAD` 和 `onSpeechEnd`（16kHz Float32）。默认值〔实测源码〕：positive 0.3 / negative 0.25 / preSpeechPad 800ms / redemption 1400ms / minSpeech 400ms，默认用 legacy 模型，可选 v5/v6。资源〔实测〕：v5 onnx 2.3MB，ort wasm 11.2MB（gzip 后约 2.9MB） |
| snakers4/silero-vad | https://github.com/snakers4/silero-vad | 10457 | 2026-09-29 | MIT | 上面那个库用的模型。README 说 30ms 一块在单 CPU 线程上不到 1ms，训练数据覆盖 6000 多种语言，对非英语和口音友好〔文档〕 |
| TEN-framework/ten-vad | https://github.com/TEN-framework/ten-vad | 2287 | 2026-10-09 | Apache-2.0 **附加条件** | 更轻的 VAD，有 WASM 版本（Web 库约 277KB），自称检测“说完”比 Silero 快几百毫秒〔文档〕。附加条款需要法务看过才能用 |
| pipecat-ai/smart-turn | https://github.com/pipecat-ai/smart-turn | 1624 | 2026-01-29 | BSD-2-Clause | 语义上的“说完了吗”判断模型（v3.x，约 8M 参数，基于 Whisper-tiny，支持 23 种语言含中/日/印地语），CPU 推理约 10–100ms，用法是和 VAD 配合〔文档〕。README 里没写能在浏览器跑 |
| pipecat-ai/pipecat | https://github.com/pipecat-ai/pipecat | 16561 | 2026-10-18 | BSD-2-Clause（未核） | 开源实时语音智能体框架（Python）。可以参考它的 STT→LLM→TTS 流水线和打断处理，但我们是 Next/Node 的单回合 HTTP 架构，不建议引入 |
| livekit/agents、agents-js | https://github.com/livekit/agents | 14804 / 943 | 2026-10-18 | Apache-2.0（未核） | 基于 WebRTC 的实时语音智能体，有多语言轮次检测。需要 LiveKit 服务器，对现阶段太重 |
| openai/openai-realtime-agents | https://github.com/openai/openai-realtime-agents | 7002 | 2026-10-17 | MIT（未核） | Realtime API 的 Next.js 参考实现：WebRTC、按键说话和 VAD 两种方式 |
| openai/realtime-voice-component | https://github.com/openai/realtime-voice-component | 886 | 2026-10-09 | Apache-2.0 | React 和 Realtime 组件，默认 `server_vad`，README 声明“不承诺长期支持”〔文档〕 |
| OpenAI Realtime VAD 文档 | https://developers.openai.com/api/docs/guides/realtime-vad | — | — | — | 有 `server_vad` 和 `semantic_vad` 两种（后者的 `eagerness` 可设 low/medium/high，low 会让用户慢慢说）〔文档，搜索摘要〕 |
| xenova/whisper-web | https://github.com/xenova/whisper-web | 3345 | 2026-10-17 | MIT（未核） | 在浏览器里跑 Whisper（transformers.js）。模型要几十到上百 MB，不适合微信和低端手机 |
| k2-fsa/sherpa-onnx | https://github.com/k2-fsa/sherpa-onnx | 15339 | 2026-10-18 | Apache-2.0（未核） | 离线 ASR、TTS、VAD，有 WASM 演示。如果以后要自建或做离线方案可以参考 |
| MERaLiON（A*STAR）· MERaLiON-2-10B-ASR / AudioLLM | https://huggingface.co/MERaLiON/MERaLiON-AudioLLM-Whisper-SEA-LION ；论文 https://arxiv.org/pdf/2412.09818 | — | 2025–2026 | 见模型卡 | 新加坡本地的语音大模型。论文报告在新加坡测试集上的错误率约 5%，同一测试集 Whisper-large-v2 约 33%；2 代 ASR 版自称比 whisper-large-v3 好 5–30%〔文档，部分来自镜像模型卡〕。10B 参数，需要 GPU |
| AudioLLMs/AudioBench | https://github.com/AudioLLMs/AudioBench | 331 | 2026-10-08 | 未核 | MERaLiON 团队的评测框架，含新加坡英语 ASR 子集，可以借来做评测 |
| IMDA National Speech Corpus（NSC） | https://www.imda.gov.sg/about-imda/emerging-technologies-and-research/artificial-intelligence/national-speech-corpus | — | — | Singapore Open Data Licence v1.0；商用需向 nsc@imda.gov.sg 申请〔文档，依据 2019 年论文〕 | 新加坡英语朗读和对话语料，适合做 ASR 评测集。小众加载器 kopicee/nscloader、cyaaronk/IMDA2RareWordDataset（路名等罕见词，和“问路、地址”场景直接相关） |
| jimbozhang/speechocean762 | https://github.com/jimbozhang/speechocean762 | 200 | 2026-10-08 | CC BY 4.0（未核） | 非母语英语发音评分语料（以中文为母语的说话人），评分标准是“接近母语”。拿它当反例：说明为什么不该给口音打分 |
| tzyll/goparrot（GOP） | https://github.com/tzyll/goparrot | 55 | 2026-07-16 | 未核 | “发音好坏度”（GOP）算法实现，用于朗读评测。不适合我们（见第 4 节） |
| sil-ai/tts-singlish | https://github.com/sil-ai/tts-singlish | 11 | 2025-06-28 | 未核 | 用 IMDA 语料训练的 Tacotron2 新加坡英语 TTS，旧且小，只证明“可行” |
| Azure Speech en-SG 神经语音（Luna、Wayne） | https://docs.signalwire.com/voice/tts/azure | — | — | 商业 | 现成的新加坡英语口音 TTS。标准神经语音约 USD 15 / 百万字符〔第三方转引〕 |
| 移动端音频资料 | WebKit MediaRecorder：https://webkit.org/blog/11353/mediarecorder-api/ ；WKWebView 中 getUserMedia 永不返回：https://onbugs.webkit.org/show_bug.cgi?id=259465 ；后台静音：https://developer.apple.com/forums/thread/689182 | — | — | — | iOS 和微信 WebView 的已知坑 |
| 转写幻听和提示词回显 | https://community.openai.com/t/gpt-4o-transcribe-outputs-content-from-prompt-instruction-for-small-silent-audio-samples/1367326 ；https://community.openai.com/t/transcription-model-gpt-4o-mini-transcribe-prompt-leakage/1371126 | — | — | — | 静音或很短的录音会被转写出提示词或词表里的词〔社区报告〕 |
| 口音偏差研究 | Graham & Roll 2024（JASA EL）摘要：https://www.cambridge.org/engage/coe/article-details/65490ca0a8b423585a102952 ；语码混用被“翻译”：https://arxiv.org/pdf/2410.04527 | — | — | — | Whisper 对非母语口音更差；强制指定 en 时，混用的其他语言可能被翻译成英语 |

## 3. 改进建议（按优先级）

先说单回合成本的基线〔推断，单价需核〕：

| 环节 | 现用模型 | 估算 |
|---|---|---|
| 转写 | gpt-4o-mini-transcribe，约 USD 0.003/分钟 | 5 秒录音约 USD 0.0003 |
| 回应 | gpt-4.1-mini，USD 0.40 / 1.60 每百万 token | 输入约 1.5k、输出约 80 token，约 USD 0.0008 |
| 配音 | gpt-4o-mini-tts，约 USD 0.015/分钟 | 4 秒回答约 USD 0.001 |
| **合计** | | **约 USD 0.002–0.004 / 回合**；预留 USD 0.03 |

### P0（下一批，零费用或接近零费用）

**P0-1 浏览器端“没听到声音”门槛：不发送，不计入回合**
- **改什么：**在 `start()` 拿到的 stream 上接一个 `AnalyserNode`，统计录音期间的 RMS 和“有声帧”总时长。如果低于阈值（比如有效声音不到 300ms），就不调用 `/api/practice-turn`，直接显示“没听到声音，可以再说一次，或者点‘提示’”。这一版不需要下载任何模型。服务端也可以加一条：`silence` 状态的回合不计入 `maxTurnsPerCourse`。
- **为什么：**现在会先 `reserve()` 再转写，静音回合同样占用每课 20 次（`practice-turn.ts` 中 `count(*)` 不分状态）。静音录音在 gpt-4o 系列转写上可能被“幻听”出文字，然后对方会认真回应一句不存在的话，违背 F8.4“不冒充理解”（社区报告见第 2 节）。Silero 和 vad-web 的思路相同，只是这里先用最简单的能量门。
- **涉及文件：**`app/scene-practice.tsx`（start/send）、`lib/practice-turn.ts`（计数口径）、各语言的 copy 文件。
- **大小：**S。**费用：**零，而且能省下无效回合（每次约 USD 0.0003–0.003）。

**P0-2 对方回答改用小格式音频，并记录各阶段耗时**
- **改什么：**`speakReply` 请求 TTS 时用 `response_format: 'mp3'`（iOS、安卓、微信都能播；opus 在旧 Safari 上有风险〔推断〕）。课程配音仍保留 wav，因为视频合成需要它。服务端日志只记 `stt_ms / llm_ms / tts_ms / bytes`，不记内容。
- **为什么：**现在 `generateLineAudio` 固定输出 wav，一句 4 秒的回答约 190KB，转 base64 后约 250KB 放进 JSON〔推断〕；mp3 约 16–32KB。现在没有任何延迟数据，没法判断要不要上流式或 Realtime。
- **涉及文件：**`lib/practice-providers.ts`、`lib/generated-audio.ts`（加 format 参数）、`lib/practice-turn.ts`（mimeType 校验）、`app/api/practice-turn/route.ts`。
- **大小：**S。**费用：**不变（TTS 按 token 计费，与格式无关〔推断〕）。

**P0-3 iOS 和微信的播放失败要说出来，并在点按时解锁音频**
- **改什么：**`useEffect` 里 `audio.current?.play().catch(() => {})` 失败时，显示“点这里听对方的回答”，并保证一下就能点到。在“开始说”的点击处理里，先对复用的 `<audio>` 元素做一次静音 `play()`/`pause()` 解锁〔推断：常见做法，需要真机确认〕。`getUserMedia` 显式传 `{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }`。
- **为什么：**回答是在异步请求之后才播放，已经离开了用户手势。iOS 和 WKWebView 的自动播放策略可能拒绝，现在失败时什么都不显示，只剩一个小的 controls 播放器。WKWebView 中 `getUserMedia` 偶尔挂起不返回（WebKit bug 259465）：建议加 8 秒超时，超时后提示“请在系统浏览器打开”。这与 F1.3 已有的微信外部浏览器指引一致。
- **涉及文件：**`app/scene-practice.tsx`、`app/practice-copy.ts`。
- **大小：**S。**费用：**零。

**P0-4 先建一个口音和学习者小评测集，再决定任何转写改动**
- **改什么：**30–50 段短录音，来源是团队、志愿者（书面同意，只用于评测、不入库）和 NSC 的少量片段（先发邮件申请许可）。要覆盖：新加坡口音的对方台词、中/印尼/日/韩/印地语为母语者的英语回答、夹中文的回答、静音和环境噪声（食阁、MRT）、很短的回答（“Yes.”、“Can.”）。比较三项：①转写模型 gpt-4o-mini-transcribe、gpt-4o-transcribe、whisper-1；②`language='en'` 与不指定语言；③有无关键词提示。指标不只看 WER，还要看“意思保留率”，以及“夹中文时有没有被翻成英语”。
- **为什么：**目前没有任何 SG/L2 实测。研究显示 Whisper 系列对非母语口音更差，强制指定 en 时可能翻译混用的语言（arxiv 2410.04527）。MERaLiON 的数字是它自己的测试集，不能直接套用。
- **涉及文件：**新增离线脚本（`scripts/` 或 `tests/fixtures/asr-eval/`），评测结果写进 `docs/evidence/`。不改运行时代码。
- **大小：**M。**费用：**约 3 种模型 × 2 种设置 × 50 段 × 5 秒，约 USD 0.1–0.5，需要负责人批准（属于付费调用）。

### P1（真机和评测之后）

**P1-1 可选“说完自动结束”（Silero VAD，懒加载）**
- **改什么：**仍然由学习者点“开始说”。如果打开了“说完自动结束”（开关存本机），就用 `@ricky0123/vad-web` 的 `MicVAD`（v5 模型）检测“说完”，自动结束录音；“说完了”按钮和 30 秒上限保留。`redemptionMs` 建议调到 2000–2500，默认 1400 对犹豫的初学者可能太短，会切掉半句〔推断，要用 P0-4 的录音调〕。模型和 wasm 自己托管，只在开关打开时下载。
- **为什么：**vad-web 是成熟的浏览器实现（ISC，2k 星）。资源合计约 5MB（gzip 后）〔实测〕，不应进首屏。如果嫌大，可以评估 TEN VAD 的 WASM 版本（约 277KB），但要先过它的附加许可条款。
- **涉及文件：**`app/scene-practice.tsx`、`app/use-study-settings.ts`、`package.json`、`public/vad/`。
- **大小：**M。**费用：**模型费用为零；CDN 流量约 5MB/首次。

**P1-2 转写时传“本课关键词”作为提示**
- **改什么：**`transcribeSpeech` 加 `prompt`，只放本课里的专有名词和本地词（如 HDB、MRT、kopi-O、Tampines、PCF），**绝不放示范答案**。前提是 P0-1 的静音门已经上线。
- **为什么：**官方和集成方文档都把 prompt 当作词汇提示。但社区报告显示，在静音或短音频上提示词会被“回显”。如果放了示范答案，静音就可能被转成“正确答案”，回顾会把它记成“独立完成”。
- **涉及文件：**`lib/practice-providers.ts`、`lib/practice-turn.ts`（传入课程关键词）。
- **大小：**S。**费用：**几十个 token，可以忽略。

**P1-3 用转写置信度决定“请再说一次”，不拿它打分**
- **改什么：**请求时加 `include: ['logprobs']`（gpt-4o 系列转写支持〔文档〕）。整体置信度很低时，对方回答“Sorry, can say again?”，或者引导学习者用“用母语说”，并把这一回合记为“尚不能判断”。置信度**不显示**，不存储，不进回顾。
- **为什么：**F8.4 要求听不清时说“请再说一次”、不怪发音。现在完全靠 LLM 从可能错误的转写里猜。
- **涉及文件：**`lib/practice-providers.ts`、`lib/practice-turn.ts`、`lib/practice-review-outcomes.ts`。
- **大小：**S–M。**费用：**零。

**P1-4 新加坡口音配音：请本地人做 A/B 听审**
- **改什么：**同样 20 句，对比 gpt-4o-mini-tts（marin/cedar，加 Singapore English 指令）和 Azure en-SG-LunaNeural/WayneNeural。请 3–5 位新加坡听者盲听，评“像本地人、听得懂、不夸张”。按结果决定对练和课程用哪种声音。
- **为什么：**F4.1 和 audit 都写着“配音口音没有经本地人听审”。OpenAI 指令式口音的效果没有公开评测〔推断：不稳定〕。Azure 有专门的 en-SG 声音。
- **涉及文件：**`lib/generated-audio.ts`、`lib/practice-providers.ts`（如果加 Azure 适配器）。
- **大小：**M。**费用：**听审约 20 句 × 2 种，不到 USD 0.1。Azure 正式使用时，一句约 80 字符，约 USD 0.0012/回合，和现在基本持平〔转引价〕。

**P1-5 “听自己 / 听示范”对比回放（发音反馈的公平替代）**
- **改什么：**录音 Blob 只在本页内存里保留一个 `URL.createObjectURL`。回答之后，可以“听我刚才说的”，再点“听示范”，由学习者自己比较。离开本回合就 `revokeObjectURL`，不上传、不存储。
- **为什么：**能给学习者“听觉反馈”，又不需要机器评判口音，符合 F4.5 和 F14.5“不长期保存原始录音”。
- **涉及文件：**`app/scene-practice.tsx`。
- **大小：**S。**费用：**零。

**P1-6 先出文字，配音随后（或用流式 TTS）**
- **改什么：**按 P0-2 的耗时数据决定。如果 TTS 占大头，就把回合拆成“先返回 reply 文本，前端显示‘对方正在说…’，再取音频”，或者用 TTS 流式输出。
- **涉及文件：**`app/api/practice-turn/route.ts`、`lib/practice-turn.ts`、`app/scene-practice.tsx`。
- **大小：**M。**费用：**不变。注意：要保持“一回合预留一次费用、不自动重试”的规则。

### P2（暂不做，留作实验）

- **P2-1 Realtime API 自由聊模式**（gpt-realtime-mini，WebRTC，`semantic_vad`，eagerness=low）。它延迟最低，也支持打断，但会失去现在的严格 JSON 合同（coachNote、goalChange、understood 等）、按回合预留费用、“只把转写当数据”的边界，以及安全提示的逐回合控制。费用随上下文增长：音频单价约 USD 10/20 每百万 token（输入/输出）〔转引，旧 mini 型号〕，粗估每回合 USD 0.005–0.02〔推断〕。改动涉及 `practice-turn.ts` 整个架构，L。只建议作为单独标明“实验”的模式。
- **P2-2 语义判断“说完了吗”**（smart-turn）。需要服务端 Python 推理。对“点一下开始说”的模式收益有限，L。
- **P2-3 MERaLiON-2-10B-ASR 作为低置信度时的第二意见。**只有 P0-4 证明 OpenAI 转写在新加坡口音或学习者口音上明显不行时才考虑。需要 GPU（10B 参数），月成本至少几百美元〔推断〕，L。
- **P2-4 在同一次练习里保持麦克风流**，以免 iOS 和微信每回合都弹权限框。这是隐私上的取舍，和 C4 的“切后台释放麦克风”有关，要先真机确认是否真的会重复弹框，S–M。

## 4. 风险和不建议做的

1. **不要根据 ASR 转写文字给发音打分**，也不要用“转写和示范句的相似度”代替发音分。转写错误和口音、噪声、模型偏差纠缠在一起（Graham & Roll 2024）。最后会变成“说得像美国人就高分”，和 spec 的 F4.5、F8.4、K 系列冲突。现有 `SOUND_JUDGEMENT` 过滤要保留。
2. **不要引入 GOP / speechocean762 / Azure Pronunciation Assessment 这类发音评分。**它们的参考标准是“母语式发音”。speechocean762 的打分就是以接近母语为准。对“尊重新加坡英语”的产品，这是方向性冲突。可以用的替代是“对方是否听懂意思”（现有的 `understood`）加上学习者自己对比回放（P1-5）。
3. **不要把转写置信度、VAD 概率显示成分数或进步曲线。**它们测的是信号质量，不是能力。
4. **不要给转写的 prompt 放示范答案或长句**（会有提示词回显的风险，见 P1-2）。
5. **默认不要做全自动免按键对话和打断。**对怕开口的学习者，“AI 抢话 / 停顿一下就被切断”正是 spec R2 L2 列出的痛点。VAD 的默认结束阈值（1400ms）是按流畅说话者设计的。
6. **不要在浏览器里跑 Whisper**（whisper-web、transformers.js）。模型要几十到上百 MB，在微信和中低端手机上首轮体验很差，准确率也不如云端。
7. **不要现在就自建 ASR 或微调**（MERaLiON、NSC 微调）。GPU 和运维成本跟现在的用户规模不匹配。NSC 商用要先向 IMDA 申请，不能默认可用。
8. **不要为了 VAD、评测或回放而上传或长期保存原始录音。**评测集只用有书面同意的志愿者录音，单独保管，不进产品库（F14.5）。
9. **不要以为 Playwright 模拟视口就代表 iOS 和微信可用。**WKWebView 的 `getUserMedia` 挂起、后台静音、自动播放拒绝，都只有真机能发现（audit F13.4，仍待负责人做）。
10. **价格提醒：**本报告里的单价来自第三方转引和记忆，openai.com 定价页这次会话打不开。`PRACTICE_TURN_MICROS` 的 0.03 预留目前看足够保守，但调整前要按官网价格重算。
