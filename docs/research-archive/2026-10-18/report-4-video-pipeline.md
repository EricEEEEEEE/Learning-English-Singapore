# 研究报告 #4：AI 视频/课程生成管线与替代方案

范围：仓库 `Learning-English-Singapore`（分支 `codex/ai-handoff-20261016`，只读）+ 网络检索。撰写日期 2026-10-18。
已读：`docs/evidence/t71/c3-live-generation.md`、`lib/generation-tasks.ts`、`lib/generation-runner.ts`、`lib/scene-video-prompt.ts`、`lib/live-generation-runtime.ts`、`lib/generated-script.ts`、`lib/generated-video.ts`、`lib/verify-final-video.ts`、`lib/preview-video-provider.ts`、`spec.md` K4/K7。

**可信度说明（如实）**
- 本会话 GitHub API / github.com 均被代理拒绝（403），`gh` 不可用。开源项目的“最近活动”改用 Hugging Face 模型卡 `lastModified`（HF API 实测），不是 GitHub 提交时间。
- LTX 价格来自**官方文档 docs.ltx.io/pricing.md（2026-10-18 抓取）**，可信。其余供应商（Kling、OmniHuman、InfiniteTalk、MiniMax、Seedance、Hedra、HeyGen、Veo）官方价格页多为 JS/Cloudflare 拦截，价格来自第三方转售商或比价站，标为“二手”，**下单前必须在官方页核价**。
- 未对任何模型做真实生成测试（本报告零花费）。

---

## 1. 结论摘要

- **当前方案方向正确，不建议换掉 LTX 作为主供应商。** 核心需求是“用我们自己的配音驱动画面、只让对方一人对口型”，LTX `v2/audio-to-video` 正好是“按输入音频计费、视频长度跟音频走、可带首帧图”的接口；Veo 3.1、Kling 3.0、Seedance 2.0、MiniMax H3 等“原生音画”模型是**自己生成声音**，与“全片配音由 TTS 决定、学员台词静音”的设计冲突。
- **立刻可省 33% 的便宜档：`ltx-2-3-pro` audio-to-video 720×1280 为 USD0.06/秒（官方，2026-10-18），同样单次 20 秒**；现用 `ltx-2-5-fast` 为 USD0.09/秒。50 秒课程：USD3.0 vs USD4.5。画质需付费小样对比后再定。`ltx-2-5-pro` 在 720p 只允许 10 秒音频，段数翻倍、接缝更多，不推荐。
- **最大缺口是“出片前没有画面质检”。** 现有 `verify-final-video.ts` 只校验容器/解码/时长；用户发现的三类问题（乱切、错人对口型、角色反了）**全部无法被现有自动检查拦截**。P0 应加本地零费用质检闸门：镜头切换检测（PySceneDetect）、人脸数（MediaPipe）、“学员台词时段对方嘴是否在动”、段间接缝相似度、可选 vision-LLM 抽帧审核（每课约 1 美分）。
- **人物一致性**：现在第一段只有文字描述，第二段起用上一段末帧接续——末帧若闭眼/侧脸/模糊，劣化会一路传下去。建议先用 OpenAI 图像模型生成“对方定妆照”（720×1280，几美分），**第 1 段也用它做 `image_uri`**，并作为后续各段人脸相似度基准；LTX 官方提供 `camera_motion: "static"`，可降低手持晃动造成的漂移。
- **备用供应商建议 Kling AI Avatar（图+音频→说话人像，二手价约 USD0.05–0.10/秒）**：天然“只有一个人、只对输入音频对口型”，兜住“错人对口型”；代价是画面偏“单人对镜头讲话”、场景动作少（K4 要求有环境与动作，只能作降级）。口型修补可选 sync.so lipsync-2（约 USD0.05/秒，作用于已有视频）。
- **自托管开源（InfiniteTalk / Wan2.2-S2V / LatentSync / MuseTalk）现在不划算**：14B 级模型需 48–80GB 显卡、独立 Python 环境与运维，单人项目在月产量 < 几百课前省不下钱；Wav2Lip 预训练权重仅限非商用，SadTalker 2023 年后停滞，均不建议。
- **首次付费验证预算建议 USD25 封顶**（LTX 2.5-fast vs 2.3-pro 各 2 课、Kling Avatar 1 课、口型修补 1 段、定妆照若干），配合新质检闸门，用数据决定默认档位。

---

## 2. 方案 / 项目对比表

“接受我们的音频？”= 能否用我们自己的 TTS 对白音轨驱动口型。50 秒成本不含重试。

### 2.1 托管 API

| 名称 | 链接 | 接受我们的音频？ | 质量（场景/口型） | 50 秒成本 | 许可/自托管需求 | 价格来源与日期 |
|---|---|---|---|---|---|---|
| **LTX `ltx-2-5-fast` A2V（现用）** | docs.ltx.io/pricing | 是（`audio_uri`，720/1080p 单次 ≤20 s；可带 `image_uri`、`last_frame_uri`、`camera_motion`） | 有场景动作；单人口型尚可，多人时“谁都对口型”（已用对方专用驱动轨规避） | **USD4.50**（0.09/s） | 商业 API；预付按最长 20 s 预扣（每在途任务需 ≥USD1.80，与证据“需 172 美分”吻合） | 官方，2026-10-18 |
| **LTX `ltx-2-3-pro` A2V** | 同上 | 是，720/1080p 单次 ≤20 s | 上一代，画质待验证 | **USD3.00**（0.06/s） | 同上（也是 API 默认 model） | 官方，2026-10-18 |
| LTX `ltx-2-5-pro` A2V | 同上 | 是，但 720p 单次 ≤10 s | 最高档 | USD6.00（0.12/s），约 5–6 段 | 同上 | 官方，2026-10-18 |
| Kling AI Avatar v2（标准/专业） | fal.ai、PiAPI、Atlas 转售 | 是（人像 + 音频） | 单人说话人像，口型好，场景动作有限 | 约 USD2.4–2.6 / 4.8–5.2 | 商业 API | 二手：Atlas 0.048/0.095 /s、PiAPI 0.052/0.104 /s，2026 |
| OmniHuman 1.5（字节） | fal.ai、BytePlus | 是（图 + 音频，720p ≤60 s） | 半身/全身、手势，口型强 | 约 USD8（0.16/s） | 商业 API | 二手：fal 比较页 0.16/s；转售价 0.045–0.25/s 不一，2026 |
| InfiniteTalk（托管） | fal.ai / WaveSpeed | 是（图或视频 + 音频，长视频） | 长时身份稳定，可视频配音 | 约 USD15（480p 0.30/s，存疑） | 托管或自托管（Apache-2.0） | 二手（竞品软文），2025-12 |
| sync.so lipsync-2 | sync.so/pricing | 是（**改已有视频口型**） | 修补用，不生成场景 | 约 USD2.4–2.5（0.04–0.05/s）；免费账号每月 3 次 ≤20 s | 商业 API | 官方文档经检索摘要，2026 |
| Hedra Character-3 | hedra.com | 是（图 + 音频） | 表情好，单人 | 6 credits/s，美元换算未查到 | 订阅 USD15–100/月 | 二手：usagepricing 2026-07；costbench 2026-09 |
| HeyGen Avatar IV API | heygen.com | 是（自定义音频） | 数字人播报风格，非微剧 | 不明（API 钱包独立，数字冲突） | 商业 | 二手，2026 |
| MiniMax H3 | MiniMax 开放平台 | 部分：音频仅作参考（≤3 段、合计 ≤15 s），自生成声音 | 原生音画、2K | 约 USD7–13（0.14–0.26/s @2K） | 商业 | 二手：Atlas/Segmind/EmpirioLabs，2026 |
| Kling 3.0 / O3（原生音频） | Kling 开放平台 | 否（自生成声音） | 场景质量高 | 约 USD4–11（0.084–0.224/s） | 商业 | 二手：EvoLink/fal，2026-02~06 |
| Seedance 2.0 | BytePlus | 未确认可输入自有对白 | 场景质量高 | 约 USD5.6（0.112/s） | 商业 | 二手，2026 |
| Veo 3.1 Fast / Lite | Gemini API | 否（自生成声音；单段 8 s） | 高 | Fast 约 USD5（0.10/s）；Lite 约 USD2.5（0.05/s） | 商业 | 二手：benchlm 2026-09-11 |
| OpenAI Sora/Videos API | — | — | — | — | **2026-09-24 已关停** | — |

### 2.2 开源（自托管）

“最近活动”= Hugging Face 模型卡最后修改日期（GitHub 本会话不可达）。

| 名称 | 链接 | 接受我们的音频？ | 质量/定位 | 50 秒成本（估） | 许可 / 硬件 | 最近活动 |
|---|---|---|---|---|---|---|
| LTX-2.5 开放权重 | huggingface.co/Lightricks/LTX-2.5 | 是（ComfyUI A2V，可首帧） | 与 API 同族；可训 LoRA/IC-LoRA 固定角色 | 租 GPU，未实测 | 自定义许可（需核商用条款）；大显存 | 2026-10-11（下载 199 万） |
| InfiniteTalk | huggingface.co/MeiGen-AI/InfiniteTalk | 是（图/视频 + 音频，不限长） | Wan 14B 基座，长视频稳定，可视频配音 | 租 H100 约 USD2–3/时（速度未实测） | Apache-2.0；≥48–80GB | 2025-09-04 |
| MultiTalk | huggingface.co/MeiGen-AI/MeiGen-MultiTalk | 是，多人分别驱动 | 双人对话 | 同上 | Apache-2.0 | 2025-07-12 |
| Wan2.2-S2V-14B | huggingface.co/Wan-AI/Wan2.2-S2V-14B | 是（图 + 音频） | 电影感说话视频 | 同上 | Apache-2.0；80GB 级 | 2025-09-17 |
| OmniAvatar-14B | huggingface.co/OmniAvatar/OmniAvatar-14B | 是 | 全身 + 提示控制 | 同上 | Apache-2.0 | 2025-08-06 |
| EchoMimicV3 | huggingface.co/BadToBest/EchoMimicV3 | 是 | 1.3B 轻量 | 较低（中端卡） | Apache-2.0 | 2026-01-23 |
| Hallo3 | huggingface.co/fudan-generative-ai/hallo3 | 是 | CogVideoX 基座，慢 | 高 | MIT | 2026-07-31 |
| FantasyTalking | huggingface.co/acvlab/FantasyTalking | 是 | Wan 基座 | 高 | Apache-2.0 | 2025-05-09 |
| LatentSync 1.6 | huggingface.co/ByteDance/LatentSync-1.6 | 是（**改已有视频口型**） | 512px 人脸区回贴 | 低（18GB 显存） | OpenRAIL++ | 2025-06-12（此后无新版） |
| MuseTalk | huggingface.co/TMElyralab/MuseTalk | 是（改口型，实时级） | 256px 面部区 | 低 | MIT | 2026-09-22 |
| LivePortrait | github.com/KwaiVGI/LivePortrait | 否（视频/表情驱动） | 表情迁移，不直接适用 | — | MIT | 未取得 |
| SadTalker | huggingface.co/vinthony/SadTalker | 是 | 仅头部，AI 感重 | 低 | MIT | 2023-04-08（停滞） |
| Wav2Lip | github.com/Rudrabha/Wav2Lip | 是（改口型） | 嘴部 96px，模糊 | 低 | **权重仅限非商用研究** | 未取得 |

### 2.3 质检工具（本地运行，零模型费用）

| 工具 | 用途 | 许可 | 备注 |
|---|---|---|---|
| PySceneDetect 0.7.2（PyPI 实测） | 段内切镜检测 | BSD-3 | 段内应为 0 |
| MediaPipe Face Detector / Landmarker | 每帧人脸数、嘴部开合 | Apache-2.0 | “仅一人出镜”“学员时段不张嘴” |
| SyncNet（joonson/syncnet_python） | LSE-C/LSE-D、音画偏移 | MIT | 与人评相关性有限，**只作相对阈值**；GRID 真实视频约 LSE-C 7.7 / LSE-D 6.9 |
| ffmpeg `ssim`/`blackdetect`/`freezedetect` | 接缝相似度、黑帧/冻结 | LGPL/GPL | 已在依赖中 |
| facenet-pytorch / OpenCV SFace | 对方与定妆照身份相似度 | MIT / Apache | 避开 InsightFace 非商用权重 |
| Vision-LLM 抽帧审核 | 人数、性别/外观一致、无字幕文字、同一地点 | — | 每课 6–9 帧，约 USD0.01 |

### 2.4 可比的开源“课程/讲解视频生成”管线

- **Paper2Video / PaperTalker（showlab，arXiv 2510.05096）**：LLM 幻灯片与讲稿 → TTS → 光标定位 → 说话头（Hallo2，独立 conda 环境，建议 A6000 48GB）→ 合成，另附评测基准。可借鉴：**说话头作可插拔后端；自带自动评测**。
- **MoneyPrinterTurbo 类短视频工具**（据既有了解，本会话未能访问 GitHub 核实）：LLM 文案 → TTS → 字幕时间轴 → 素材/生成画面 → moviepy/ffmpeg 合成。
- 共同模式：**音频是时间轴唯一真相；分段生成后拼接；失败段单独重做**。我们已具备，且在幂等/预算/“不重发未知提交”上更严格；**缺的是画面层面的自动评测**。

---

## 3. 对我们管线的具体改进建议

规模：S≈半天，M≈1–2 天，L≈3–5 天（含先红后绿考题）。成本为每课新增供应商费用。

### P0（充值前就做，零或几美分）

1. **视频质检闸门（每段 + 成片）**
   - 检查项与初始阈值（用付费小样标定）：段内切镜 = 0；单人脸帧占比 ≥90%、>1 张脸的帧 ≤2%；**学员台词时段对方嘴部开合方差 / 对方台词时段 ≤0.35**（直指“错人对口型”）；段间接缝 SSIM ≥0.6；对方与定妆照/首段人脸相似度 ≥阈值；无 >1 s 黑帧/冻结。
   - 不通过 → 新状态 `quality_failed`（附原因与关键帧），**不向学员展示**；允许预留预算后只重做该段一次，仍不过则人工或降级。
   - 文件：新 `scripts/video-qa/qa.py`（`python -I` 运行，输入段视频 + 时间轴 JSON，输出 JSON）；新 `lib/video-quality-gate.ts`（`execFile`，同 ffprobe 模式）；`lib/generation-runner.ts`（在 `probeVideo` 后、`chainReferenceImage` 前加一步）；`lib/generation-tasks.ts`（`videoQuality` 记录与状态）；考题 `tests/domain/video-quality-gate.spec.mjs`（预演卡片 + 合成双人脸/切镜样例做红题）。
   - 规模 L；成本 USD0（本地 CPU，约 10–30 s/课）。
2. **对方定妆照 + 第 1 段首帧**：脚本后按 `scene.partnerLook`/`setting` 生成 720×1280 第一视角定妆照；第 1 段 `image_uri` 用它，后续段继续末帧接续，但末帧若被判“无正脸/模糊/闭眼”，回退定妆照或末段 0.5 s 内最清晰帧。生成页可先展示“对方长这样”。
   - 文件：新 `lib/generated-keyframe.ts`；`lib/generation-tasks.ts`（`referenceImage` 增来源类型）；`lib/extract-reference-image.ts`（多候选帧打分）；`lib/live-generation-runtime.ts`。规模 M；约 USD0.02–0.07/课（**图像价格未在本会话核实**）。
3. **提示与参数小改**（`lib/scene-video-prompt.ts`、`lib/generated-video.ts`、`lib/live-scene-runner.ts`）：加 `camera_motion: "static"`（官方参数），提示中 “handheld” 改 “steady eye-level shot”，可 A/B；写明 “single shot, not multi-shot”（LTX-2.5 宣传原生多镜头，与单镜头冲突）；`model` 改为白名单配置 `LES_LTX_MODEL=ltx-2-5-fast|ltx-2-3-pro`，`LIVE_RESERVATIONS` 随模型（2.3-pro：20 s×0.06=USD1.20/段）。规模 S；成本 USD0 或更省。
4. **预演模式跑质检可跑部分**（时间轴、接缝、驱动轨学员时段能量≈静音），零费用覆盖闸门代码。规模 S。

### P1（首次充值验证后）

5. **分级预览档**：T0 卡片（已有，USD0）；**T1 定妆照动态海报**（zoompan + 全片配音 + 英文字幕，约 USD0.05/课，生成中/失败时可学，按 K4 标注“非动画成片”）；T2 只生成第 1 段试看（2.3-pro 约 USD1.2），确认后再生成剩余段；T3 全片。文件：`lib/preview-video-provider.ts`、`lib/generation-tasks.ts`（段级等待确认）、生成页 UI。规模 M–L。
6. **备用供应商**（`EncodedVideoProvider` 已是接口）：新 `lib/generated-video-kling-avatar.ts`（经 fal 或官方），输入定妆照 + 对方驱动轨；LTX 返回 402/503 或质检两次不过时切换。需改 `download-generated-media` 主机白名单、`live-generation-runtime.ts` 选择逻辑、独立预算单价。规模 M；约 USD2.5–5/课（二手价）。**需核实单次音频上限、9:16 720×1280 支持、数据保留与条款。**
7. **口型修补通道（可选）**：“学员时段嘴动比”不过但其余合格时，送 sync.so lipsync-2 用对方驱动轨重做嘴部，再还原完整音轨。新 `lib/lipsync-repair.ts`。规模 M；仅失败段付费，约 USD1/段。

### P2（量起来以后）

8. **固定角色库 + LoRA**：常见场景（小贩中心摊主、班主任、HDB 物业、诊所前台）预生成并人工挑定妆照，跨课复用；量大后用 LTX Trainer 训角色 LoRA（仅自托管）。规模 L。
9. **自托管评估**：月产量稳定 >300 课（API 约 USD900–1350/月）时，评估租 H100 跑 LTX-2.5 开放权重或 InfiniteTalk；先确认 LTX 开放权重商用条款。规模 L。
10. **成本/质检看板**：按课记录预留、实付（拉供应商账单）、质检得分、重做次数，替代证据中“实际花费未核对”的手工估算。规模 M。

---

## 4. 推荐的最终视频方案与小额付费验证计划

### 推荐方案

- **主路径**：gpt-4.1 脚本 → TTS（按性别选声）→ **定妆照（新增）** → LTX audio-to-video（对方专用驱动轨，首段用定妆照、后续末帧接续，`camera_motion: static`）→ 还原完整音轨 → **质检闸门（新增）** → 拼接 → 成片校验 → 才对学员可见。
- **默认模型**：若验证中 `ltx-2-3-pro` 质检通过率与人工评分不低于 `ltx-2-5-fast`，默认 2.3-pro（USD3.0/50 s 课）；否则保留 2.5-fast（USD4.5/课）。
- **降级/备用**：Kling AI Avatar（约 USD2.5–5/课）；再不行用 T1 定妆照动态海报（约 USD0.05/课，如实标注）。
- **每课预计总成本**（脚本/配音美分级 + 定妆照 + 平均 0.3 段重做）：约 **USD3.5–6**。

### 小额付费验证计划（预算 **USD25 封顶**）

前置：P0 第 1–3 项完成且全量 verify 通过；LTX 余额 ≥USD12（预付需为每个在途 20 s 任务预扣 USD1.80）；沿用既有两场景（学校接孩子、小贩中心鸡饭，修订 16/17，脚本与配音已有）。

| 步骤 | 内容 | 预计费用（USD） |
|---|---|---|
| 1 | 两场景各生成定妆照 2 张，人工挑 1 张 | 约 0.3 |
| 2 | `ltx-2-5-fast` 720p 生成两课全片（约 54 s + 51 s） | 约 9.5 |
| 3 | `ltx-2-3-pro` 720p 同输入生成两课 | 约 6.3 |
| 4 | Kling AI Avatar（标准）生成小贩中心 1 课 | 约 2.6（专业档约 5.2） |
| 5 | 对质检最差 1 段做 sync.so 口型修补（先用免费额度） | 0–1 |
| 6 | 预留 1–2 段单段重做 | 约 2–3.6 |
| | **合计** | **约 21–25** |

验收标准（写入新证据文档）：
1. 闸门：段内切镜 0、单人脸帧 ≥90%、学员时段嘴动比 ≤0.35、接缝 SSIM ≥0.6；并**人工复核闸门判断是否与肉眼一致**以标定阈值（SyncNet 只作相对参考）。
2. 主人看片：无乱切、对方性别与声音一致、角色不反、对方只在自己台词时开口；1–5 分评分。
3. 记录每课实付（核对 LTX/Kling 账单）与耗时。
4. 决策：2.3-pro 通过率与评分不低于 2.5-fast → 改默认；Kling Avatar ≥3/5 → 列为备用；都不过闸门 → 暂停扩大付费，回到提示/定妆照层面用零费用预演迭代。

### 来源（价格均标注日期）

- LTX 官方价格与接口（2026-10-18 抓取）：https://docs.ltx.io/pricing.md 、https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video.md 、https://docs.ltx.io/models/ltx-2-5.md 、https://docs.ltx.io/api-changelog/2026/9/2
- Kling Avatar：https://www.atlascloud.ai/blog/guides/best-ai-video-api-photorealistic-digital-human-faces 、https://piapi.ai/de/blogs/kling-ai-avatar-guide-standard-vs-pro ；Kling 3.0：https://evolink.ai/blog/kling-3-api-pricing-integration-guide
- OmniHuman：https://fal.ai/learn/biz/omnihuman-15-vs-omnihuman-comparison ；InfiniteTalk：https://breakingac.com/news/2025/dec/05/how-to-choose-the-most-cost-effective-infinite-talk-api-the-efficient-solution-provided-by-kieai/
- sync.so：https://sync.so/pricing 、https://sync.so/docs/billing ；Hedra：https://www.usagepricing.com/blueprint/activity/hedra-2026-07-29-character-3-hailuo-lineup 、https://costbench.com/changelog/hedra-api-price-increase-2026-09/
- HeyGen：https://admakeai.com/blog/heygen-pricing-explained ；MiniMax H3：https://www.atlascloud.ai/blog/guides/minimax-h3-lip-sync-and-audio ；Seedance：https://blog.segmind.com/seedance-2-0-release-date-pricing-key-features-for-developers/ ；Veo 3.1：https://benchlm.ai/media-pricing/veo
- SyncNet 指标局限：https://arxiv.org/pdf/2511.04520 、https://arxiv.org/pdf/2110.03342 ；Paper2Video：https://huggingface.co/papers/2510.05096 ；LatentSync：https://github.com/bytedance/LatentSync （检索摘要）
- 开源模型许可与日期：Hugging Face API（2026-10-18 实测）；PySceneDetect：PyPI（2026-10-18 实测）
