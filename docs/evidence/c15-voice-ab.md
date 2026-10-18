# C15-3 · 新加坡口音配音样本（2026-10-18）

- 授权：用户 2026-10-18 11:53 UTC；C15 单独记账，本项上限 < USD0.1。
- 执行：Claude（session_019e92wo3KtrqUZSxkrf5o9d）。脚本 `scripts/c15/voice-ab.mjs`；账本 `/mnt/project-files/les-c15/ledger.json`。
- 样本与评分表：`/mnt/project-files/les-c15/voice-ab/`（40 个 mp3、`rating-sheet.csv`、听者说明 `README.md`；答案在 `organiser-only/key.csv`，不要发给听者）。音频不进仓库。

## 做了什么

同样 20 句“对方”台词（小贩中心、诊所、MRT、组屋、学校接送、服务中心；其中 2 句带 lah / ya、1 句 “can?”），`gpt-4o-mini-tts-2025-12-15`，marin（女）/ cedar（男）交替，同一句两版用同一个声音：

| 版本 | 指令 |
| --- | --- |
| plain | Speak slowly and clearly for an adult English beginner. Be respectful and conversational, never exaggerated. Read only the supplied line. |
| sg（产品现用，`lib/generated-audio.ts`） | 同上，多 “with a natural Singapore English accent” |

注意：产品的默认指令本来就带 Singapore English 口音，所以这里的对照是“去掉口音指令 vs 产品现状”，不是“默认 vs 加口音”。

每句随机（固定哈希）分成 X / Y，20 句中 14 句 X 是 plain；汇总时按 key 还原。两版总时长 plain 86.3 秒、sg 85.7 秒，语速基本一样。

## 评分表

`rating-sheet.csv`：每位听者每句 X、Y 各一行，三项 1–5 分——像本地人（sounds_local）、听得懂（easy_to_understand）、不夸张（not_exaggerated），X 行另填偏好（X / Y / same）和备注。建议决定规则写在 README：sg 版“像本地人”平均高出 0.5 分以上、另两项不低于 plain 0.3 分以上才保留口音指令。

**结果：尚无。** 需要 3–5 位本地听者，由负责人安排（外部联系另需授权）。

## 自测转写（未完成）

原计划把 40 个 mp3 用产品设置（gpt-4o-mini-transcribe、language=en）转写回来，看两版是否都听得懂。前 26 次请求全部返回 HTTP 400（脚本把 mp3 上传成 `answer.mpeg`，推测是文件名或 SSE 拼接的 mp3 容器不被接受，没有再花钱排查）。按规则失败请求不重发，并按整笔预留记账；记到第 26 次时账本合计 USD0.099914，下一笔预留会超过 USD0.1，脚本自动停止。剩下 14 次没有发出。脚本已改为按真实扩展名上传，但本项不再续跑。

可参考的间接证据：C15-1 里按“新加坡口音”指令生成的 5 段英语（c01–c04、c10），产品转写设置都保住了意思（c04 的 aunty 被写成 “Anti”）。

## 费用

| 请求 | 次数 | 记账 |
| --- | --- | --- |
| SSE 用量探测（确认 TTS 能返回真实 usage） | 2 | USD0.002393（第 1 次输出没解析到，按第 2 次估） |
| gpt-4o-mini-tts 生成 40 个样本（SSE 真实 usage） | 40 | USD0.053949 |
| 转写自测（HTTP 400，全部按预留记） | 26 | USD0.043571 |
| **合计（账本）** | 68 | **USD0.099914**（上限 0.1，未超） |

HTTP 400 一般不计费，所以实际花费很可能约为 USD0.056；但没有拿到账单确认，账本按预留记。

## 决定与 blocked

- 配音指令暂不改：没有听审结果之前，产品继续用带 Singapore English 的现有指令。
- **Azure en-SG 对比 blocked**：没有 Azure Speech 密钥和区域。需要用户提供 Azure Speech 密钥和区域（以及另批的少量费用），才能生成 en-SG-LunaNeural / WayneNeural 两种声音加入同一张评分表。接入 Azure 适配器另批。
- 本地听者盲听：需要负责人找 3–5 位听者。
