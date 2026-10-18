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

- （2026-10-18 后续：已复查并做 C15-2b 修复，见下节“修复后复查”。）当时新提示词在真实模型上的修复效果**没有复查**：本项授权上限是 30 轮，已用 29 轮 + 1 次脚本生成。复查约需 10 轮（R3b、R7a、R7b、R8c、R11b、几条正确回答看 coachNote 是否为 null），预计约 USD0.005，需要用户另批。
- 修复只靠提示词的 5 项（改目标、闲聊、多余提示、结束、语气词）没有确定性兜底，真实效果以复查为准。
- 考题注释里写的“25 of 27 replies”是笔误，实际是 26 轮回应中 23 轮带 coachNote（代码注释已改正）。

## 修复后复查（2026-10-18，C15-2b）

- 授权：属于用户 2026-10-18 已批准的 C15-2（账本上限 USD0.9），本次复查自设预留 ≤ USD0.05，记在同一账本（标签 `RC-` / `RC2-`）。
- 脚本：`scripts/c15/prompt-spotcheck.mjs --recheck --turns`（第 1 轮，基线 8db5fe6 = C15-2a 修复后）和 `--recheck --round 2 --turns`（第 2 轮，C15-2b 修复后 54c36ad；母语建议提示词没改，不重跑 R8）。方法同上：文字转写替身、不配音、单次采样、gpt-4.1-mini-2025-04-14。
- 原始结果：`/mnt/project-files/les-c15/prompt-recheck/results.json`、`/mnt/project-files/les-c15/prompt-recheck-2/results.json`。

### 费用

| 轮次 | 请求 | 预留合计 | 实际 | token（输入 / 输出） |
| --- | --- | --- | --- | --- |
| 第 1 轮（C15-2a 后） | 12 | USD0.031493 | USD0.004825 | 10,022 / 510 |
| 第 2 轮（C15-2b 后） | 10 | USD0.026622 | USD0.005074 | 10,542 / 536 |
| **复查合计** | 22 | 逐个预留，同时在途最多 1 个 | **USD0.009899**（自设上限 0.05） | — |

C15-2 账本累计 USD0.053800（上限 0.9）。无失败、无未知、无重发。

### 第 1 轮：C15-2a 修复后（12 轮）

| 规则 | 轮次 | 结论 | 摘录 |
| --- | --- | --- | --- |
| 改目标走 goalChange | RC-R7a | 部分 | goalChange 有（“帮家人打包三份鸡饭”，界面会弹确认），但 reply 已接受：“Sure, three packets to take away. Will you want steamed or roasted chicken?” |
| | RC-R7b | 部分 | goalChange 有，reply 是确认问题；confirm 写成中文（界面不用 confirm，不影响）；附带一条夸奖式 coachNote “问句表示确认，适合初学者。” |
| 偏题拉回、understood 正确 | RC-R3b | **不遵守** | “My son goes to school near here.” → “That's good. What school does he go to?”，understood=true（和修复前一样） |
| | RC-R3d | 部分 | “The weather is so hot today. Do you like durian?” → understood=false，拉回了，但先答了闲聊 “Yes, I like durian very much.”；coachNote “引导回话题，关注重要文件。”（解释场景） |
| 母语只有语气词算没听懂 | RC-R8c | 遵守 | “嗯……那个……” → understood=false，suggestion=null |
| | RC-R8d | 遵守 | “呃……就是……那个……” → understood=false，suggestion=null |
| 最后一句即结束 | RC-R11b | **不遵守** | “Okay, thank you very much.” → “Please wait at the seating area. Your number will be called soon.”，done=false |
| | RC-R11c | 遵守 | 诊所脚本最后一回合 → “Yes, please wait here. The doctor will see you soon.”，done=true |
| 能懂时 coachNote 为空 | RC-R1a | 遵守 | “One chicken rice, please.” → coachNote null |
| | RC-R2b | 遵守 | “Is the chicken rice spicy?” → coachNote null |
| 建议说法放进引号被 C12-2 丢掉 | RC-R4b | 模型不遵守 / 产品端碰巧保留 | “"Chili no want" 可以说成 "no chili" 更简洁。”——建议句仍加引号，因 no、chili 都在转写里才没被丢 |
| | RC-R6b | **不遵守（产品端丢失）** | “"Have bring"改为"have brought"更正确…”——brought 不在转写里，整条提示被丢 |

结论：语气词 2/2、能懂时不给提示 2/2 已遵守；偏题、结束、建议引号仍不遵守，改目标只做到一半。按 Loopwork 登记 C15-2b 修复。

### C15-2b 修复（红 b4d9202 → 绿 54c36ad，verify 2476/2476 exit0，verify-20261018-131514）

| 问题 | 修复 |
| --- | --- |
| reply 先写、标记跟着 reply 走（RC-R3b、RC-R7a、RC-R11b） | 严格输出的字段顺序改为 understood、done、goalChange、reply、coachNote、suggestedWording；提示词：先定 understood、done、goalChange，reply 与之一致（understood=false 时不接闲聊；有 goalChange 时 reply 就是确认问题；done=true 时只礼貌收尾） |
| 最后一回合不结束（RC-R11b） | 对方台词是脚本最后一句对方台词时，提示词多一行“This is the last turn of the script…set done to true” |
| 建议说法加引号（RC-R4b、RC-R6b） | 新字段 suggestedWording（英文、不加引号）；coachNote 只引用学员原话；适配器把 suggestedWording 去掉引号后以 “ → ” 接在 coachNote 后面（超过 120 字只留 coachNote；没有 coachNote 就不显示）。C12-2 校验本身不改，turn 服务和界面不改 |

考题：`tests/domain/c15-prompt-fixes.spec.mjs` 新增 4 项；c6、c9、t63b 的字段清单加 suggestedWording。

### 第 2 轮：C15-2b 修复后（10 轮）

| 规则 | 轮次 | 结论 | 摘录 |
| --- | --- | --- | --- |
| 改目标走 goalChange | RC2-R7a | 遵守 | reply 就是确认问题 “You want to buy three packets of chicken rice to take home, right?”，goalChange 有 |
| | RC2-R7b | **不遵守** | “Okay, no problem. Tomorrow afternoon is fine. What time will you come?”，goalChange=null（第 1 轮这条是有的；单次采样，时好时坏） |
| 偏题拉回、understood 正确 | RC2-R3b | 部分 | understood=false（产品端按没听懂处理），但 reply 仍顺着问 “Oh, where is his school?” |
| | RC2-R3d | 遵守（回复）/ 不遵守（coachNote） | reply 直接拉回 “Do you have your appointment letter and your passport with you?”；coachNote “不要换话题…”（告诉学员该做什么，规则不允许），产品端保留 |
| 最后一句即结束 | RC2-R11b | 遵守 | “You are welcome. Have a good day!”，done=true |
| | RC2-R11c | 遵守 | “Thank you, take care!”，done=true |
| 能懂时 coachNote 为空 | RC2-R1a | 遵守 | coachNote null |
| | RC2-R2b | **不遵守** | 正确问句也给了提示 ““Is the chicken rice spicy?” 提问是否辣 → Is chicken rice spicy?”（第 1 轮这条是 null） |
| 建议说法与 C12-2 | RC2-R4b | 遵守 | “Chili no want” 更自然的表达是 no chili, please. → No chili, please（产品端保留） |
| | RC2-R6b | 遵守 | ""Yes I have bring" 应为简单过去式或现在完成时。 → Yes, I have brought the passport and letter."（第 1 轮同一输入被丢，这次保留） |

### 复查结论

| 规则 | 第 1 轮（C15-2a 后） | 第 2 轮（C15-2b 后） | 现状 |
| --- | --- | --- | --- |
| 改目标走 goalChange | 2 轮 goalChange 都有，reply 1 条已接受 | 1 条完全遵守，1 条 goalChange 漏掉 | **仍不稳定** |
| 偏题拉回且 understood 正确 | 1 不遵守、1 部分 | understood 2/2 正确；reply 1 条仍顺着闲聊 | 有改善，仍不稳定 |
| 母语只有语气词算没听懂 | 2/2 | 未重跑（提示词未改） | 遵守 |
| 回答最后一句即结束 | 1/2 | 2/2 | 遵守 |
| 能懂时 coachNote 为空 | 2/2 | 1/2（RC2-R2b 多给）；另 RC-R7b、RC-R3d、RC2-R3d 在非“正确回答”回合附带夸奖或解释 | **仍不稳定** |
| 建议说法被 C12-2 丢掉 | 2 条都加引号，1 条被丢 | 2/2 建议进 suggestedWording，产品端都保留 | 已修复 |

- 每条只抽 2 轮、单次采样，结论只说明“会不会出现”，不是遵守率。
- 仍不稳定的三项（改目标、偏题时 reply 顺着聊、多余 coachNote）只靠提示词，没有确定性兜底；本次不再继续改（授权只含修后一次复查）。可选的确定性兜底：有 goalChange 时 reply 直接用 confirm、understood=false 时丢掉 coachNote 之外的建议性文字、正确回答回合由代码清空 coachNote（需要能判“正确”，不简单）。是否继续由用户决定。

## 代码兜底（C15-2c，2026-10-18，零费用）

用户 2026-10-18 要求：复查后仍不稳定的三项不再只靠提示词，在服务端加确定性兜底，不调用任何付费 API。改在 `lib/practice-turn.ts` 的回合服务（模型回应之后、配音之前），提示词和回应合同都没改；适配器只把 suggestedWording 的拼接符改成共用常量 `WORDING_JOIN`（仍是 “ → ”）。

| 问题 | 兜底规则 | 考题 |
| --- | --- | --- |
| 有 goalChange，但 reply 已经接受新目标（RC-R7a） | 有 goalChange 时，配音和显示的回复一律换成 goalChange.confirm；confirm 不是一句英文问句（例如 RC-R7b 写成中文）时换成固定英文 “Just to check, you want to change the plan, right?”。goalChange 本身原样返回，页面照常弹“换成新目标 / 保持原来” | c15 2 项 |
| understood=false，reply 仍顺着闲聊（RC-R3d 先答 “Yes, I like durian very much.”、RC2-R3b “Oh, where is his school?”） | understood=false 时，reply 必须只有一句、以问号结尾，且至少含一个本课台词里的实词（去掉 the/you/what/please/sorry 一类虚词，简单去复数 s）；否则换成本课**当前对方台词**的简短重述：台词里最后一个问句；台词没有问句时把最后一句改成 “…, okay?”。台词来自已存课程，不新调模型 | c15 6 项 |
| understood=true 时多余的 coachNote（夸奖、解释场景、告诉学员下一步做什么） | 少纠正时照旧全丢；正常纠正时，coachNote 只有在引用了学员原话（引号里的英文词都在本轮转写里，或非英文引文原样出现在转写里）或带着适配器接上的 suggestedWording（“ → ”）时才保留，否则丢掉，回复照常 | c15 8 项 |

Loopwork：红 5a5ae75（新考题 16 项，红跑 13 失败 / 159 通过）→ 绿 7b136f4，完整 verify 2492/2492 exit0（verify-20261018-135056）。旧考题按新行为改期望：C12-2 “无引号”“只引中文”两行在听懂时改为丢掉（同样两条在没听懂时仍保留，新考题锁定）；C15-2 R10d 九例夹具加上对学员原话 “Is it allowed” 的引用，期望不变，仍只由辅助语言规则决定。

### 用已记录的真实回答回放（零费用）

把三次真实调用（首轮抽查 26 轮对练回应、两轮复查 10 + 10 轮）记下的模型原始 JSON 原样喂给新回合服务（替身转写、替身配音，不联网）。脚本和逐轮结果：`/mnt/project-files/les-c15/prompt-fallback-replay/replay.mjs`、`replay.json`。

| 规则 | 被兜底改正 | 兜底后仍漏 |
| --- | --- | --- |
| 改目标 | RC-R7a 回复由 “Sure, three packets to take away…” 换成确认问句；RC-R7b 中文 confirm → 固定英文确认（模型原回复本身就是问句，换后意思不变） | R7a、R7b（首轮）、RC2-R7b：模型**根本没给 goalChange**，回复直接接受新时间 / 数量，代码无法判断 |
| 偏题 | RC-R3d 换成 “Do you have your appointment letter and your passport?”；RC2-R3b 换成 “Hi, what would you like today?” | R3b、RC-R3b：模型给了 understood=true 并跟着聊（“That's good. What school does he go to?”），代码不判断偏题 |
| 多余 coachNote | 首轮丢掉 7 条（R1a 解释对方的词、R3c、R9a、R10a–c 说空话或解释、R6b），RC-R7b 夸奖丢掉 | 带引号的夸奖或解释仍保留：R2b “句型正确”、R9b “是很好地回答”、R11a “是合适的表达”、R7a “注意“packets”表示打包食物”、RC-R3b、RC2-R2b（引了正确原句又给了几乎相同的建议句）；understood=false 时的指令类提示（RC-R3d “引导回话题…”、RC2-R3d “不要换话题…”）按规则保留 |

另：首轮 R6b “说have brought更自然，但你的意思明白。” 是有用的提示，因为没有引号也没有 suggestedWording 被丢掉（C15-2b 之后模型会把建议放进 suggestedWording，如 RC2-R6b 保留）。回放没有出现正确澄清问句被误换：R3a “Do you want chicken rice or some other rice?” 保留。

### 残余风险（如实）

- **漏给 goalChange 无法确定性检测**：模型不给 goalChange 而直接接受新时间、数量时（首轮 R7a/R7b、RC2-R7b），回合服务只看到普通回复，没有可靠的规则区分“改任务”和“同一任务内的小选择”。仍只靠提示词；三次真实调用里 6 条改目标请求（R7a、R7b、RC-R7a、RC-R7b、RC2-R7a、RC2-R7b）有 3 条漏掉。
- **understood=true 的偏题不处理**：偏题判断只信模型的 understood；模型标 true 并跟着聊时照样配音（R3b、RC-R3b）。
- **实词重叠是粗规则**：澄清问句只用虚词（“Sorry, can you say that again?”）也会被换成对方台词的重述；问句碰巧含本课词但仍在闲聊时会被放过；含 “Mr.” 之类缩写的句子会被算成两句而被换掉。重述用的是脚本当前对方台词，已经确认新目标（currentGoal）后可能与新目标不符。
- **coachNote 规则只看形式**：有引号或有建议句的夸奖、解释仍会显示；没有引号的有用提示（模型没用 suggestedWording 时）会被丢，“宁丢不错”。
- 本次没有新的真实模型调用；兜底在真实流量上的效果只由上面的回放说明（46 轮、单次采样），不是遵守率估计。
