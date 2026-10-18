# 调研报告 #1：GitHub 上的开源 AI 角色扮演 / 对话式语言学习项目

调研日期：2026-10-18。对象产品：Learning English in Singapore（分支 `codex/ai-handoff-20261016`，只读核对 `lib/practice-providers.ts`、`lib/practice-turn.ts`、`lib/practice-reviews.ts`、`lib/live-practice.ts`、HANDOFF.md、spec v0.5 K1–K7、first-version-audit、tasks.md C3–C9）。

方法：`gh search`/GitHub 搜索 API 被限制，改用 WebSearch + GitHub topic 页面（language-learning、speaking-practice、ai-tutor、language-tutor）找候选，再对 12 个仓库浅克隆，读 README 和提示词/核心代码。星数取自 2026-10-18 的 GitHub 页面。**标“推断”的是判断，没有在对方代码里直接看到。**

## 1. 结论摘要

- **我们的对练设计已经领先于大部分开源项目。** 一问一答 + 每轮先预留费用、严格 JSON 回应、不评发音、尊重口音、改目标先确认（C9-1）、母语求助（C9-2）、沉默由页面主动提示（C4）。不需要换架构，也不需要上实时语音。
- **最值得抄的是“防止模型说瞎话”的校验。** poligloti 丢掉引用了学习者没说过的话的纠错，Mural 要求证据引用转写里一字不差的原文。我们目前只过滤“发音/口音”类评语（P0，零费用）。
- **缺“跨课复听”。** Echo-Loop（4.2k★）1 次首学 + 7 轮间隔复习（6 小时到 28 天）；ThirtyTutors “难点连续答对两次才移出”。可零模型费用生成“今天再听这几句”（P1）。
- **场景要写成带结构的“剧本卡”。** 补上“预期流程 / 语域 / 关键词块 / 一个小意外”（P1，生成时 token 略增）。
- **缺按人和按时间的限额。** 正式对外前补“每账号每日轮数 + 每分钟频率”（P0，零费用）。
- **不要照搬：** 打分评级、“不说目标语就不往下走”、每个错都纠、全双工实时语音、长期个人记忆。
- 许可证：Echo-Loop、FreeLingo、ExamKlaar 为 AGPL-3.0；Enjoy、polyglot 为 GPL-3.0；ThirtyTutors 为 PolyForm Noncommercial；companion 为 CC BY-NC。**只借鉴思路，不复制代码。** MIT：Mural、hi-kid、speechgpt、poligloti；Immergo 为 Apache-2.0。

## 2. 调研到的项目

| 项目 | 链接 | ★ | 最后提交 | 相关点 |
|---|---|---|---|---|
| Enjoy | github.com/ZuodaoTech/everyone-can-use-english | 39.0k | 2026-06-29 | 跟读 + 发音评测；按上下文给 5 条“我可以怎么说”附母语解释 |
| Echo-Loop | github.com/echo-loop/Echo-Loop | 4.2k | 2026-10-17 | 精听→跟读→盲听→复述→间隔复习；意群切分；断点续学 |
| speechgpt | github.com/hahahumble/speechgpt | 2.7k | 2026-07-11 | 早期语音聊天网页（参考价值低） |
| polyglot | github.com/liou666/polyglot | 2.6k | 2025-09-03 | ChatGPT + Azure 语音桌面端，不活跃 |
| Mural | github.com/Chuloo/mural | 1.7k | 2026-10-18 | 每轮最多纠一处、不纠方言、换话题先确认、只在 App 要求时做沉默回访；引用必须是原文子串；分钟账本，安静会话自动结束 |
| hi-kid | github.com/xiaochong/hi-kid | 1.2k | 2026-04-25 | 儿童英语伙伴，全本地零 API 费用 |
| Immergo | github.com/ZackAkil/immersive-language-learning-with-live-api | 510 | 2026-04-30 | 任务式角色扮演（missions.json）；每人每分钟 2 次限流，会话 180 秒上限 |
| companion | github.com/shakedzy/companion | 195 | 2024-12-03 | 不活跃，CC BY-NC |
| FreeLingo | github.com/artcc/freelingo | 181 | 2026-10-16 | Next.js 16 + FastAPI；本课内容写进对练提示词；每人每日/每周语音分钟上限 |
| ThirtyTutors | github.com/wiss84/thirtytutors | 3 | 2026-09-13 | 提示词分区 PERSONA / RULES / GUARDRAILS；“难点”连续答对 2 次才移出 |
| poligloti | github.com/isa-aguilar/poligloti | 1 | 2026-10-04 | 面向“怕开口”的人；场景 md 写情境/角色/预期流程/语域/词汇；每场一个小意外；丢掉引用不实的纠错；按句流式 TTS；课后“本可以用的说法” |
| ExamKlaar | github.com/RashadAnsari/examklaar | 0 | 2026-10-17 | 荷兰新移民口语考试练习，Next.js 16 |
| SprechMate | github.com/2-3-5-7/SprechMate | 17 | 2026-10-13 | TTS 按“同句+同声音”缓存到 IndexedDB；每月用量统计 |

没有找到同时做到“新加坡场景 + 近零基础 + 视频微剧 + 轮流语音对练”的开源项目。

## 3. 改进建议

费用：“零”指不增加模型/API 调用；“一次性小额”指只在生成课程时多一点 token。

### P0

**P0-1 纠错引用校验**：服务端检查 `coachNote` 里引号中的英文词必须都出现在本轮 `transcript` 里，否则只把 coachNote 置空、保留对方回复（同 `SOUND_JUDGEMENT` 过滤）。依据 poligloti `backend/llm_parse.py`、Mural `TeachingPolicy.assessment`。对应 `lib/practice-turn.ts`、`lib/practice-providers.ts`；F8、F12。规模 S，费用零。

**P0-2 每账号日限额和频率限制**：`practice_turns` 账本上加每账号每天最多 N 轮（如 60）、每分钟最多 M 轮（如 6）。超限如实提示“今天的对练次数用完了，可以继续听和看”，零费用功能照常。现在只有全局 `maxReservedMicros` 和每课 20 轮（推断：没看到按 owner 的日限额）。依据 Immergo `server/main.py`、FreeLingo、Mural `docs/conversation-minutes.md`。对应 `reserve()`、`lib/live-practice.ts`；F14。规模 S，费用零。

### P1

**P1-1 跨课“再听这几句”（间隔复听，不调模型）**：用练后回顾里“还需要帮助 / 提示后完成 / 选了意思”的回合 + 句子页“听不懂”报告，按 1/3/7/14 天到期；连续两次无提示完成才移出。复用同版原音和字幕。对应 `lib/practice-reviews.ts`、`lib/sentence-reports.ts`、`lib/scene-progress.ts`；F10、K6。规模 M，费用零。

**P1-2 种子升级为“剧本卡”**：36 个种子补预期流程（3–5 步）、语域、3–6 个关键词块、一个小意外；用户场景由脚本请求按同一结构先补全。依据 poligloti scenarios、Immergo missions.json。对应 `lib/scene-seeds.ts`、`lib/generated-script.ts`；F3、F4、F9、K3.2。规模 M，一次性小额；语域描述需新加坡本地审查（负责人事项）。

**P1-3 每个学习者回合预生成 2–3 个“也可以这样说”**：脚本生成时产出，附五语意思；对练中提示先给这些选项，不再每轮调模型。依据 Enjoy chat-suggestion、Immergo、poligloti。对应 `lib/scene-course.ts`、`lib/practice-meanings.ts`；F9、F5。规模 M，一次性小额。

**P1-4 练后“你说的 / 示范句”并排**：开口了但差别大的回合并排显示，可点播原音，只说“也可以这样说”。依据 poligloti `missed_opportunities`。规模 S，费用零。

**P1-5 转写带场景词偏置**：`gpt-4o-mini-transcribe` 传 `prompt`（本课专有名词，如 Tampines、HDB、MRT、kopi）。开源项目里没看到直接这么做（推断收益）。对应 `transcribeSpeech`；K5.3、F4。规模 S，费用约等于零。

### P2

- **P2-1 提示词分区**：`respondInScene` 改成 `# ROLE & SCENE` / `# TURN RULES` / `# GUARDRAILS`，数据块明确标注。依据 ThirtyTutors。规模 S；行为变化需小额实测。
- **P2-2 先显示文字、语音随后到**：依据 poligloti `reply_stream.py`。规模 M，费用零（推断：回复短，收益有限）。
- **P2-3 对用户显示“今天还能对练 N 轮”，不显示美元**：依据 Mural。规模 S，费用零。
- **P2-4 难句意群切分**，让循环可按意群：依据 Echo-Loop。规模 M。

## 4. 不建议照搬

| 做法 | 出处 | 原因 |
|---|---|---|
| 完成任务后打 1–3 分，“native-like”算最高 | Immergo | 规格不打分、尊重口音 |
| 母语求助必须先说目标语才继续 | Immergo 沉浸模式 | 与 C9-2 和近零基础用户冲突 |
| 每个错都纠、重复最多 3 次、头像“难过/恐惧” | ThirtyTutors | 违背“轻纠错、少纠正” |
| 全双工实时语音 | ThirtyTutors、Immergo、Mural | 守不住硬上限（T63A 已记录） |
| 滚动摘要长期记忆 | ThirtyTutors、FreeLingo | 持续模型费用 + 更多个人信息 |
| 每轮调模型生成“我可以怎么说” | Enjoy | 改为生成时预产出（P1-3） |
| 本地小模型全离线 | hi-kid、poligloti | 质量和五语支持不够 |
| 复制代码或场景文本 | AGPL/GPL/NC 项目 | 许可证限制 |
| CEFR 定级、XP、连续打卡 | FreeLingo、poligloti | 规格不冒称等级；打卡给零基础用户压力（推断） |

## 附：已确认我们已有

- 换话题先确认（Mural ≈ C9-1）；沉默由 App 发起回访（Mural ≈ C4 T18A）；转写只当数据、不评发音（C6）；课程内容作为对练上下文（FreeLingo ≈ T63A）。

## 来源

GitHub topic 页面 ai-tutor、speaking-practice、language-learning、language-tutor；第 2 节各仓库 README 与源文件（2026-10-18 浅克隆）；ThirtyTutors 经 Product Hunt 页面找到。
