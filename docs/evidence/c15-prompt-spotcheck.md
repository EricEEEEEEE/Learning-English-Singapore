# C15-2 · 新提示词真实抽查（2026-10-18）

- 授权：用户 2026-10-18 11:53 UTC「全部通过，全部开始吧」；C15 单独记账，本项账本预留 ≤ USD0.9，总轮数 ≤ 30。
- 执行：Claude（会话 session_019e92wo3KtrqUZSxkrf5o9d），分支 `codex/ai-handoff-20261016`，基线 2a0b06b。
- 脚本：`scripts/c15/prompt-spotcheck.mjs`（直接调用仓库的 `respondInScene`、`suggestInEnglish`、`generateSceneScript`，模型 `gpt-4.1-mini-2025-04-14` / `gpt-4.1-2025-04-14`，提示词与合同不改）；账本 `scripts/c15/ledger.mjs`，记在仓库外 `/mnt/project-files/les-c15/ledger.json`。
- 学员输入：写好的文字转写替身，直接喂给回应模型，不转写音频；回应不配音（TTS 跳过）。
- 场景：自写虚构的小贩中心（8 行）和服务中心领准证卡（6 行，触发 official 规则）；诊所场景用本次真实生成的脚本（10 行，触发 medical 规则）。
- 原始结果：`/mnt/project-files/les-c15/prompt-spotcheck/results.json`、`script-clinic.json`（含每轮输入、模型原始 JSON、产品端过滤后会保留什么、token 用量）。
- 局限：每条规则只抽 2–4 轮，单次采样（温度默认），只能说明“会不会出现”，不能当作遵守率估计；中文 coachNote 的质量由执行者一人判断。

## 费用

| 请求 | 次数 | 预留（最坏情况） | 实际（按 usage 和 2026-10-18 官方标准价） |
| --- | --- | --- | --- |
| gpt-4.1 脚本生成（max_output_tokens 4000） | 1 | USD0.074 | USD0.033268（输入 1,078 / 输出 3,889 token） |
| gpt-4.1-mini 对练回应 + 母语建议 | 29 | 每轮约 USD0.003 | USD0.010632（输入 21,129 / 输出 1,363 token） |
| **合计** | 30 | — | **USD0.0439**（上限 0.9） |

价格（https://platform.openai.com/docs/pricing ，2026-10-18 读取）：gpt-4.1-mini 输入 0.40 / 输出 1.60，gpt-4.1 输入 2.00 / 输出 8.00（USD / 1M token）。无失败、无未知、无重发。

## C13-3 脚本合同（1 次真实生成，诊所挂号）

| 检查 | 结果 |
| --- | --- |
| 响应状态 / 是否截断 | completed，没截断；但输出 **3,889 / 4,000 token（97%）**，每轮只给了 2 个“也可以这样说”。如果模型给 3 个，会多出约 600 token，超过上限被截断，整次付费生成作废。**不遵守（余量不足）** |
| `validateGeneratedScript` | 通过（issues 为空）；138 词，在 115–160 内 |
| register / useAdvice / plainAlternative | 10 行、3 个词组全部带标注；2 个 sg-colloquial 行（“…wait around one hour, can?”“just relax first…”）都在对方台词里，都给了 plainAlternative。遵守 |
| 学习者示范不含口语 | 5 句学习者台词全是 standard。遵守 |
| “也可以这样说” | 5 轮各 2 条，均为标准英语并带五语翻译。遵守 |
| 口语项的 useAdvice | 2 行 + 2 个词组的 sg-colloquial 全部标成 **say**（入门课的口语项应是“听懂就好 / 随意场合可以说”）。**不遵守** |
| 医疗规则 | 对方台词没有诊断或用药建议。遵守 |

## 对练回合（29 轮）逐条

“产品端”指 `practice-turn.ts` 的过滤（C12-2 引号校验、发音过滤、少纠正规则）之后学员实际会看到的结果。

| 规则 | 轮次 | 结论 | 原文摘录（学员 → 对方 / coachNote） |
| --- | --- | --- | --- |
| R1 自然继续 | R1a | 遵守 | “One chicken rice, please.” → “Steamed or roasted chicken?”（附带一条多余 coachNote，见 R4） |
| | R1b | 遵守 | “Steamed. A little chili.” → “Eat here or take away?” |
| R2 合理的不同回答被接受 | R2a | 遵守 | “Roasted one, no chili. My child eats also.” → “Okay, roasted chicken, no chili. For your child, white rice or chicken only?” |
| | R2b | 遵守 | “Is the chicken rice spicy?” → “No, the chicken rice is not spicy. You can add chili if you want.” |
| | R2c | 遵守 | “Take away, please.”（脚本是堂食）→ “Sure, take away. That will be four fifty dollars. Cash or PayNow?” |
| R3 一次澄清 | R3a | 遵守 | “Uh... the... rice... ah...” → understood=false，“Do you want chicken rice or some other rice?” |
| | R3b | **不遵守** | “My son goes to school near here.”（与点餐无关）→ understood=true，“That's good. Which school does he go to?”（跟着闲聊，离开场景目标） |
| | R3c | 部分 | “Letter... no... the email?” → “Is your appointment email on your phone?”（一句澄清，但 understood=true） |
| R4 轻纠错 | R4a | 部分 | “I want one chicken rices.” → coachNote “复数形式用错，'chicken rice'通常不用复数。”（不影响意思的小错也给了；产品端因引号里有没说过的 rice 被丢掉） |
| | R4b | 遵守（模型）/ 丢失（产品端） | “Chili no want, chicken the steam.” → “No chili, okay. Eat here or take away?”；coachNote “‘Chili no want’可以说成‘No chili please’更自然。”——建议句也加了引号，引号校验把这条有用的提示丢了 |
| | R4c | 遵守 | “Eat here, please.” → coachNote null |
| 多余提示（跨轮统计） | 26 轮回应 | **不遵守** | 23/26 轮带 coachNote，其中多条落在答得正确的回合：夸奖（R2b “句型正确”、R9b “是很好地回答”、R11a “是合适的表达”）、解释对方的话（R1a “注意选择 steamed 或 roasted”、R11b “take this number 是领取排队号的表达”）、说空话（R10c “用简单句回答，不要承诺结果。”） |
| R5 少纠正 | R5a, R5b | 模型不遵守 / 产品端遵守 | 两轮都给了 coachNote（“用单数 one chicken rice…”）；产品端按“少纠正且听懂”规则丢掉，学员看不到 |
| R6 coachNote 只引用说过的话（C12-2） | 全部 23 条 | 模型 14/23 / 产品端 23/23 | 9 条把建议说法也放进引号（R1b “a little bit of chili”、R3a、R4b、R7c “boxes”、R11b 引了对方的话等），引号校验全部丢掉；R6a “\"I pay the cash\"可以说成“I pay cash”” 因建议句的词恰好都在转写里而保留（校验的已知漏洞，不算错引） |
| R7 改目标 goalChange | R7a | **不遵守** | “Can I order three packets to take home for my family instead?” → 直接接受，“Yes, you can order three packets…”，goalChange=null |
| | R7b | **不遵守** | “Sorry, can I come back tomorrow afternoon instead? I forgot my passport.” → “Okay, tomorrow afternoon is fine. What time will you come?”，goalChange=null |
| | R7c | 遵守 | currentGoal「打包三份鸡饭带回家」→ “Okay, three packets to take away. Do you want chili with all?” |
| R8 母语模式建议句 | R8a | 遵守 | “我想要鸡肉是白切的，辣椒少一点。” → “I want steamed chicken with a little chili, please.” |
| | R8b | 遵守 | “Saya lupa bawa paspor saya. Bisa datang lagi besok?” → “I forgot my passport. Can I come again tomorrow?” |
| | R8c | **不遵守** | “嗯……那个……”（只有语气词）→ understood=true，“I want one chicken rice, please.”（照脚本猜） |
| R9 多练听不清 | R9a | 部分 | “That'll be four fifty. You pay by PayNow or cash?”（有一点连读省略，没请学员确认） |
| | R9b | 未体现 | 原样复述脚本 “Please take this number and wait for your turn.”（规则写的是 now and then，不记为违规） |
| R10 医疗不下结论 | R10a | 遵守 | “What medicine should I take for my cough?” → “The doctor will check and tell you about medicine.” |
| | R10b | 遵守 | “Is it dengue?” → “Doctor will check and tell you, okay?” |
| R10 办事不下结论 | R10c | 遵守 | “Will my work pass be approved for sure?” → “The officer will check your application and let you know.” |
| | R10d | 遵守（回答）/ **不遵守（语言）** | “Can I change my job next month…?” → “You need to check with MOM about job change rules. I cannot say for sure.”；coachNote 用英文写（辅助语言是简体中文） |
| R11 自然结束 | R11a（及 R6a） | 遵守 | “Cash. Here you go. Thank you.” → “Thank you. Your order will be ready soon…”，done=true，没有新问题 |
| | R11b | **不遵守** | 学员回答了脚本最后一句对方台词 “Okay, thank you very much.” → “Please sit over there. We will call your number soon.”，done=false |
| 不评发音口音 | 全部 | 遵守 | 29 轮回复和 coachNote 都没有提发音或口音 |

**汇总**：按轮计（29 轮），明确遵守 17 轮（R1a、R1b、R2a–c、R3a、R4b、R4c、R6a、R6b、R7c、R8a、R8b、R10a–c、R11a），部分遵守、只靠产品端过滤或未体现 7 轮（R3c、R4a、R5a、R5b、R9a、R9b、R10d），不遵守 5 轮（R3b、R7a、R7b、R8c、R11b），另有两项跨轮问题（多余 coachNote、R10d 的英文 coachNote）和两项脚本问题（输出余量、口语项 useAdvice）。产品端的确定性过滤（引号、少纠正、发音）这次全部起作用。

## 修复（Loopwork：红 afec873 → 绿 45c85d5，verify 2472/2472 exit0，见 tasks.md C15-2a）

| 不遵守 | 修复 | 锁定 |
| --- | --- | --- |
| R7 改目标被直接接受 | 提示词：数量、时间或日期、地点、他人、额外要求一律算“改任务”，“do not switch yet and do not accept it yet”，先用 goalChange 确认；“辣不辣、堂食外带”这类同一任务内的小选择才直接跟随（原来两条规则互相打架） | c15 考题查提示词文本 |
| R3b 跟着闲聊 | 提示词：与场景目标无关的话不跟着聊，一句短问题拉回，understood=false | 同上 |
| 多余 coachNote | 提示词：答得能懂、没有值得一提的错误时 coachNote 为 null；绝不用来夸奖、解释自己的话或场景、告诉学员下一步做什么 | 同上 |
| R11b 不结束 | 提示词：对方刚说完脚本最后一句、学员已回答，就算完成 | 同上 |
| R8c 语气词被猜成句子 | 母语建议提示词：只有语气词（嗯、那个、uh）时 understood=false，绝不按脚本猜 | 同上 |
| R10d 英文 coachNote | 代码：辅助语言是中文、日文、韩文、印地文时，coachNote 里没有任何非拉丁文字就丢掉，回复照常（印尼语不查） | c15 考题 9 例（替身） |
| 脚本输出余量 97% | `max_output_tokens` 4000 → 6000；实时预留 `LIVE_RESERVATIONS.scriptMicros` 50,000 → 90,000 微美元（6000×8 + 20,000 字节×2，按 gpt-4.1 标准价的最坏情况）。实际花费不变，只是截断前多留余量 | T61B 脚本题改为 6000；c15 考题查预留覆盖最坏情况 |
| 口语项标成 say | 脚本提示词：每个 sg-colloquial 项的 useAdvice 只能是 hear-only 或 casual-ok | c15 考题查提示词文本 |

没改的：C12-2 引号校验会把“建议说法加了引号”的有用提示一起丢掉（R4b），这是 C12 当时“宁丢不错”的选择，本次只记录；R9 多练听不清的效果弱，规则本身是“偶尔”，不登记红题。

## 最终决定与未完成

- 新提示词在真实模型上的修复效果**没有复查**：本项授权上限是 30 轮，已用 29 轮 + 1 次脚本生成。复查约需 10 轮（R3b、R7a、R7b、R8c、R11b、几条正确回答看 coachNote 是否为 null），预计约 USD0.005，需要用户另批。
- 修复只靠提示词的 5 项（改目标、闲聊、多余提示、结束、语气词）没有确定性兜底，真实效果以复查为准。
- 考题注释里写的“25 of 27 replies”是笔误，实际是 26 轮回应中 23 轮带 coachNote（代码注释已改正）。
