# C15-1 · 转写小评测（合成代理版，2026-10-18）

> **合成代理，不能代替真人口音。** 没有真实志愿者录音（需要用户或志愿者提供 30–50 段，并书面同意，只用于评测、不进产品库；NSC 片段需先申请许可）。本次所有“学员语音”都是 gpt-4o-mini-tts 按指令模仿口音生成的，模仿的口音是否像真人没有人审过。结论只能用来排除明显的问题，不能证明真实学员的转写效果。

- 授权：用户 2026-10-18 11:53 UTC；C15 单独记账，本项上限 USD0.5。
- 执行：Claude（session_019e92wo3KtrqUZSxkrf5o9d）。脚本 `scripts/c15/asr-eval.mjs`（生成与转写）、`scripts/c15/asr-score.mjs`（零费用打分）；账本 `/mnt/project-files/les-c15/ledger.json`。
- 音频和原始结果在 `/mnt/project-files/les-c15/asr-eval/`（clips/*.wav、results.json、score.txt），不进仓库。

## 样本（30 段）

- 20 段 TTS（`gpt-4o-mini-tts-2025-12-15`，13 种声音轮换）：新加坡口音 5 段（c01–c04、c10），印度 2、印尼 2、日本 2、韩国 2、中国口音 2 段（c18 极短）；夹中文 5 段（c14–c17、c26）；犹豫停顿 1 段（c23）；极短回答 “Yes.” “Can.” “Okay.”。
- 6 段 ffmpeg 处理：c19、c20、c25 混入约低 10 dB 的粉红噪声，c21、c22 降速到 0.8 倍。
- 5 段无语音：c24 极低噪声 3 秒；c27–c30 粉红噪声、棕噪声、100 Hz 嗡声、白噪声（1–3 秒）。
- 每段带本课“关键词提示”所属课程（小贩中心 / 诊所 / 服务中心 / 住处）。提示只放专有名词和本地词，例如 `Singapore words in this lesson: Hainanese chicken rice, kopi-O, kosong, Milo, PayNow, aunty.`，不含示范答案。

## 比较的设置

| 组 | 模型 | language | 关键词提示 |
| --- | --- | --- | --- |
| A | gpt-4o-mini-transcribe | en | 无（**产品现状**，见 `lib/practice-providers.ts` transcribeSpeech） |
| B | gpt-4o-mini-transcribe | 不指定 | 无 |
| C | gpt-4o-mini-transcribe | en | 有 |
| D | gpt-4o-mini-transcribe | 不指定 | 有 |
| E | gpt-4o-transcribe | en | 无 |
| F | whisper-1 | en | 无 |

## 结果

“意思保留”= 该段所有内容词都还在（大小写、连字符、同音拼写 chilly/chili、OK/okay 不计错），25 段有语音的样本为分母。“夹中文保留”= 中文部分仍是中文，没有被译成英文。“无语音出字”= 5 段无语音里转出了任何文字。

| 组 | 意思保留 | 没保留的段 | 夹中文保留 | 夹中文时英文部分丢失或被写成中文 | 无语音出字 |
| --- | --- | --- | --- | --- | --- |
| A 产品现状 | 20/25 | c12 PCF→PCS、c15 乱码“溫コピ”、c17 passport→护照、c23 丢 rice、c25 “Ante… kosom” | 5/5 | 2 段（c15、c17） | 0/5 |
| B 不指定语言 | 21/25 | c04、c12、c15、c23 | 5/5 | 1 段 | 0/5 |
| C en + 提示 | 23/25 | c17、c23 | 5/5 | 1 段 | **5/5，全部原样吐出提示词** |
| D 不指定 + 提示 | 24/25 | c23 | 5/5 | 0 | **5/5，全部原样吐出提示词** |
| E gpt-4o-transcribe | 21/25 | c15、c23、c25、c26（Tampines 被译成“淡滨尼”） | 5/5 | 2 段 | 4/5（“Herzlichen Dank!”、希伯来文、韩文） |
| F whisper-1 | 24/25 | c23 | 4/5（c15 转成拼音 buyao tang） | 0 | 4/5（“Thank you for watching.”“you”） |

要点：

1. **夹中文没有被译成英语**：6 组都把中文部分保留为中文；`language='en'` 并没有把中文翻成英文。反方向的问题倒出现了：A 组 c17 “我忘记带 passport 了” 整句变成“我忘記帶護照了”，英文词被写成中文；c10 “Can.” 在 A 组变成“可以 Can”。
2. **关键词提示有帮助**：本地词拼对了（Aunty / kopi-O / PCF），意思保留从 20 升到 23–24。
3. **关键词提示在无语音时 100% 被回显**：C、D 两组 5 段无语音全部原样输出 “Singapore words in this lesson: …”。如果上线，噪声或误触录音会被当成学员说了这串词，送进对方回应模型，还会占一轮。这正是报告 2 P1-2 警告的风险，这次在真实接口上复现了。
4. **另外两种模型在噪声上会编字**：gpt-4o-transcribe 和 whisper-1 对纯噪声分别编出外语短句和 “Thank you for watching.”；gpt-4o-mini-transcribe 不加提示时 5/5 返回空，配合服务端“转写为空就算 silence”的现有逻辑最安全。
5. 降速（c21、c22）和低 10 dB 噪声（c19、c20）在所有组都没有影响意思；犹豫停顿的 c23 在所有组都丢了最后的 “rice”。

逐段原文见下表。

| 段 | 说明 | 原文 | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| c01 | sg / marin | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. |
| c02 | sg / cedar | Steamed, a little chili. | Steamed, a little chilly. | Steamed, a little chilly. | Steamed, a little chilly. | Steamed, a little chilly. | Steamed, a little chilly. | steamed a little chili. |
| c03 | sg / coral | Can pay by PayNow or not? | Can pay by PayNow or not. | Can pay by PayNow or not. | Can pay by PayNow or not? | Can pay by PayNow or not? | Can pay by PayNow or not? | Can pay-by-pay now or not? |
| c04 | sg / ash | Aunty, kopi-O kosong, one. | Anti, kopi o kosong, one. | anti, kopi o kosong, wan. | Aunty, kopi-O kosong, one. | Aunty, kopi-o kosong, one. | Anti kopi o kosong, one. | Auntie, kopi o kosong, one. |
| c05 | in / sage | I stay in Tampines, near the MRT. | I stay in Tampines, near the MRT. | I stay in Tampines, near the MRT. | I stay in Tampines, near the MRT. | I stay in Tampines, near the MRT. | I stay in Tampines near the MRT. | I stay in Tampines, near the MRT. |
| c06 | in / onyx | My HDB flat is at block two three five. | My HDB flat is at block 235. | My HDB flat is at Block 235. | My HDB flat is at Block 235. | My HDB flat is at Block 235. | My HDB flat is at Block 235. | My HDB flat is at block 235. |
| c07 | id / shimmer | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. |
| c08 | id / echo | Is the polyclinic open on Sunday? | Is the polyclinic open on Sunday? | Is the polyclinic open on Sunday? | Is the polyclinic open on Sunday? | Is the polyclinic open on Sunday? | Is the polyclinic open on Sunday? | Is the polyclinic open on Sunday? |
| c09 | ja / nova | Yes. | Yes. | Yes. | Yes. | Yes. | Yes. | Yes. |
| c10 | sg / verse | Can. | 可以 Can | can can | can, can | can, can | Can. | can, can |
| c11 | ko / ballad | No, thank you. | No, thank you. | No, thank you. | No, thank you. | No, thank you. | No, thank you. | No, thank you. |
| c12 | ko / coral | My son goes to PCF kindergarten. | My son goes to PCS kindergarten. | My son goes to PCS kindergarten. | My son goes to PCF kindergarten. | My son goes to PCF kindergarten. | My son goes to PCF kindergarten. | My son goes to PCF Kindergarten. |
| c13 | ja / fable | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. |
| c14 | zh / marin | 我想要 less chili, please. | 我想要less chili, please. | 我想要less chili, please. | 我想要less chili, please. | 我想要less chili, please. | 我想要less chili, please. | 我想要 less chili, please. |
| c15 | zh / cedar | One kopi, 不要糖. | 溫コピ,不要糖 | 一杯不要糖。 | One kopi,不要糖。 | one kopi,不要糖。 | 一杯kopi，不要糖。 | One kopi, buyao tang! |
| c16 | zh / sage | Excuse me, 这个多少钱? | Excuse me,这个多少钱? | Excuse me,这个多少钱? | Excuse me, 这个多少钱? | Excuse me, 这个多少钱? | Excuse me，这个多少钱? | Excuse me, 这个多少钱? |
| c17 | zh / ash | 我忘记带 passport 了. | 我忘記帶護照了 | 我忘記帶Passport了 | 我忘记带护照了。 | 我忘記帶passport了 | 我忘記帶passport了。 | 我忘记带passport了 |
| c18 | zh / nova | Okay. | OK. | OK. | Okay. | OK. | Okay | Okay. |
| c19 | noise of c01 | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. | One chicken rice, please. |
| c20 | noise of c07 | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. | I have a cough for three days. |
| c21 | slow of c05 | I stay in Tampines, near the MRT. | I stay in Tampines, near the MRT. | I stay in Tampines, near the MRT. | I stay in Tampines, near the MRT. | I stay in Tampines, near the MRT. | I stay in Tampines near the MRT. | I stay in Tampines, near the MRT. |
| c22 | slow of c13 | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. | I want to collect my work pass card. |
| c23 | hesitant / echo | Uh... I... want... chicken... rice. | Uh, I want chicken. | I want chicken. | Uh, I want chicken. | Uh, I want chicken. | I want chicken. | Uh, I want chicken. |
| c24 | silence | （无语音） | （空） | （空） | Singapore words in this lesson: Hainanese chicken rice, kopi-O, kosong, Milo, PayNow, aunty. | Singapore words in this lesson: Hainanese chicken rice, kopi-O, kosong, Milo, PayNow, aunty. | Ķemeri. | . |
| c25 | noise of c04 | Aunty, kopi-O kosong, one. | Ante, kopi o kosom | Aunti, kopi o kosong, one. | Aunty, kopi o kosong, one. | Aunty, kopi-O kosong, one. | Anti-Kopi o Kosong, 1. | Auntie, Kopi-O-Kosong, one. |
| c27 | noise-only | （无语音） | （空） | （空） | Singapore words in this lesson: polyclinic, MC, Medisave, queue number. | Singapore words in this lesson: polyclinic, MC, Medisave, queue number. | Herzlichen Dank! | Thank you for watching. |
| c28 | noise-only | （无语音） | （空） | （空） | Singapore words in this lesson: work pass, MOM, ICA, appointment letter. | Singapore words in this lesson: work pass, MOM, ICA, appointment letter. | ציפור | Thanks for watching! |
| c29 | noise-only | （无语音） | （空） | （空） | Singapore words in this lesson: HDB, MRT, Tampines, PCF, block. | Singapore words in this lesson: HDB, MRT, Tampines, PCF, block. | 지금 | You |
| c30 | noise-only | （无语音） | （空） | （空） | Singapore words in this lesson: Hainanese chicken rice, kopi-O, kosong, Milo, PayNow, aunty. | Singapore words in this lesson: Hainanese chicken rice, kopi-O, kosong, Milo, PayNow, aunty. | 상기한. | you |
| c26 | zh / shimmer | 我住在 Tampines, block 235. | 我住在Tampines, Block 235。 | 我住在Tampines, Block 235。 | 我住在Tampines Block 235。 | 我住在Tampines Block 235。 | 我住在淡滨尼第235座。 | 我住在Tampines, Block 235. |

## 费用

| 请求 | 次数 | 实际（按 usage 与 2026-10-18 官方价，取 token 价与分钟价中较高者） |
| --- | --- | --- |
| gpt-4o-mini-tts 生成样本（SSE 返回真实 usage） | 20 | USD0.020104 |
| gpt-4o-mini-transcribe（A–D 各 30 段） | 120 | USD0.020790 |
| gpt-4o-transcribe（E） | 30 | USD0.009734 |
| whisper-1（F，按 USD0.006/分钟） | 30 | USD0.009708 |
| **合计** | 200 | **USD0.060335**（上限 0.5） |

价格（https://platform.openai.com/docs/pricing ，2026-10-18 读取）：gpt-4o-mini-tts 文字输入 0.60、音频输出 12.00 / 1M token；gpt-4o-mini-transcribe 页面为 1.25 / 5 per 1M、约 USD0.003/分钟，账本按旧的较高音频价 3.00 记；gpt-4o-transcribe 约 USD0.006/分钟；whisper-1 USD0.006/分钟。无失败、无未知、无重发。

## 决定

- **转写不加关键词提示**（`transcribeSpeech` 不改）。理由：提示带来的好处是本地词拼写（模型回应通常能从 “Anti, kopi o kosong” 里理解意思），坏处是无语音时 5/5 原样回显，会被当成学员发言。要采用，至少需要“转写与提示重合即当作 silence”的兜底，并用真实噪声录音（食阁、MRT）验证回显是否也会以部分片段出现；这些要等真人录音。
- **保持 `language='en'` 和 gpt-4o-mini-transcribe**：B 组只多保留 1 段，差别在噪声范围内；夹中文在两种设置下都没被译成英语；另外两种模型在噪声上会编字。
- 记录一个新风险，不在本次修复：`language='en'` 偶尔把整句写成中文（c17）或在短回答前加中文（c10）。对练回应模型能读懂中文，但回顾里显示的“你说的”会和学员实际说的不一样。等真人录音再定。

## 没做

- 真人录音评测（30–50 段、团队与书面同意的志愿者、NSC 许可）：**仍需用户安排**。本证据不关闭 C15-1。
- 不同口音的模仿效果没有人听过；“新加坡口音”的样本可能并不像本地人（见 C15-3 的听审表）。
