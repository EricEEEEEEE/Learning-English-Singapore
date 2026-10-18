# 调研报告 #5：学习设计、留存与本地英语内容

日期：2026-10-18｜对象：Learning English in Singapore，分支 `codex/ai-handoff-20261016`（只读，未改仓库）
依据：HANDOFF.md、spec.md（K1–K7、F1–F15、§6.2–6.5、§7）、docs/current-product-baseline.md、docs/evidence/first-version-audit.md、lib/scene-seeds.ts、tasks.md C4–C9，以及下表外部资源。
标注：**〔推断〕** = 我的判断，没有直接证据；**〔记忆〕** = 来自训练知识，本次没有在网页上核实。本次 `gh` CLI 被会话限制（GraphQL/REST 403），仓库信息改用 GitHub MCP 搜索加网页读取。

---

## 1. 结论摘要

- **产品现在缺一个跨课程、跨天的复听回路。** C4–C9 已经把单课里的复听做得很完整：慢速、A-B 循环、提示、回顾按课保存。但学完一课后，没有任何机制让用户过几天回来再听一遍学过的词组和句子。最便宜、风险最低的补法是：用 MIT 许可的 **ts-fsrs** 给"本片原音的词组/句子"排一个**只听不写**的复听队列。素材都来自已经生成的课程，模型费用为 0。
- **复听要换掉 Anki 式的"打分"语气。** 自评只分三档（"没听懂 / 要提示才懂 / 听懂了"），不显示"逾期 N 张"，每天最多推几句。这样能守住 F15.1（不靠积分、打卡）和 §6.3（不惩罚）的边界。
- **F4.2（本地口语要有讲解，并区分"听懂"和"自己说"）是自检里明确"未满足"的内容缺口**，而且零成本可做。做法：在脚本合同（lib/generated-script.ts 的 `phrases`/`lines`）里加 `register` 和 `useAdvice` 两个字段，页面上显示"本地口语·听懂就好"之类的标签，再附一句清楚的替代说法。
- **本地英语的开源资源很少，质量也参差。** 能用的只有 IMDA NSC 语音语料（Singapore Open Data Licence，要申请，适合拿来做评估，不能当 TTS 用）、MNSC 多任务版、SingDict（CC BY-SA，1,783 条，由 ChatGPT 生成后再经人工修订）。GitHub 上带 "Singlish" 的项目大多是玩笑项目，或者其实是僧伽罗语罗马字（Sinhala "Singlish"）。**本地表达库只能自己建，再请本地审查者审**，不能直接拿现成数据集当权威。
- **审查流程是 F4.4/F12.2 的硬前提，而且只有负责人能做。** 建议先把 36 个种子和约 60 条本地表达做成一张审查表，按条记录审查状态（替代现在全局的 `sceneSeedsReviewed=false`）。生成的课程只抽样审，加上被举报的句子全部审。
- **"不让初学者感到羞愧"的留存设计有依据。** Duolingo 的连续打卡靠的是损失厌恶，它自己公布的数据显示打卡确实提高留存，但这些数据没有独立核实。Khan Academy 已经因为担心伤害动机而撤掉连续打卡，2026 年的西北大学工作论文也说因果证据有限。所以本产品应该继续不做打卡，只给"继续上次"和单调递增的"已听过 N 句"。
- **听力优先的方法有本地学者背书。** Christine Goh（NIE 新加坡）和 Vandergrift 提出的元认知听力循环是"先预测 → 听 → 核对 → 再听"，几乎可以零成本地套进现在的"观看 → 词组 → 句子"流程。不过它面向的是课堂听力策略，**没有针对近零基础成人做过对照实验**。
- **低读写能力用户的无障碍**：建议参照 W3C COGA 的设计模式和 LESLLA 研究（低教育成人的二语习得以口语为先，但研究总量少），重点做到"每段母语帮助都能听，不只能读"。

## 2. 调研到的项目/资源表

| # | 名称 | 链接 | Stars/类型 | 许可 | 和本产品的关系 |
|---|---|---|---|---|---|
| 1 | ts-fsrs | https://github.com/open-spaced-repetition/ts-fsrs | 827★，TS 库 | MIT | 可以直接在 Next 里用的复听调度器。API 有 `fsrs()`、`createEmptyCard()`、`next(card, date, Rating)`，要求 Node ≥20。`request_retention`、`enable_short_term` 等参数〔记忆〕存在，README 首页没写 |
| 2 | fsrs4anki | https://github.com/open-spaced-repetition/fsrs4anki | 4,111★，算法与优化器 | 〔记忆〕MIT | FSRS 算法的来源，说明里有参数含义和"期望保留率"的取舍 |
| 3 | srs-benchmark | https://github.com/open-spaced-repetition/srs-benchmark | 276★，基准 | 未核实 | 证明 FSRS 在 Anki 闪卡数据上优于 SM-2。**基准数据是文字闪卡，不是听力句子**，迁移到本产品属于〔推断〕 |
| 4 | awesome-fsrs | https://github.com/open-spaced-repetition/awesome-fsrs | 726★，清单 | — | 各语言实现和论文的索引 |
| 5 | Anki | https://github.com/ankitects/anki | 32,082★，桌面应用 | API 显示 NOASSERTION；〔记忆〕主体为 AGPL-3.0 | 只作交互参考（Again/Hard/Good/Easy、每日上限）。**不嵌入代码**，见第 5 节 |
| 6 | asbplayer | https://docs.asbplayer.dev/ | 字幕句子摘录播放器 | 未核实 | 从视频字幕里一键摘一句、带原音片段做卡片，这个模式和我们"本片原音词句"几乎一样，可以借鉴交互 |
| 7 | IMDA National Speech Corpus | https://www.imda.gov.sg/about-imda/emerging-technologies-and-research/artificial-intelligence/national-speech-corpus | 2000h+ 朗读，另有约 1000h 对话 | Singapore Open Data Licence（向 nsc@imda.gov.sg 申请）。许可原文本次没有读到 | 用来评估 ASR 对本地口音的识别，也可以作为审查者的口音参考。spec §6.5 已经说明它不能直接当 TTS 用 |
| 8 | AudioLLMs/Singlish 与 MNSC | https://github.com/AudioLLMs/Singlish ；https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1 | 7★，资源索引 | 页面没写许可（HF 本次无法访问） | 基于 NSC 的多任务集，包含 ASR、问答和口音分类，有人工核验的测试集。T63 真语音上线后可以拿来离线测转写质量 |
| 9 | SingDict | https://github.com/singdict/SingDict ；论文 https://aclanthology.org/2024.eurali-1.7 | 0★，词典 | CC BY-SA 4.0 | 1,783 条 Singlish 词条，由 ChatGPT 生成释义、母语者修订，只有部分经过人工审查。**适合给审查者当参考**；如果直接放进产品，要遵守署名和相同方式共享 |
| 10 | singlish-manglish-nlp / NUS SMS Corpus | https://github.com/zyuanlim/singlish-manglish-nlp ；https://github.com/kite1988/nus-sms-corpus | 8★ | 页面没写 | 短信文本语料，语体是书面化的口语，不是听力材料。只能用来查词频和拼写变体，相关性低 |
| 11 | sil-ai/tts-singlish | https://github.com/sil-ai/tts-singlish | 11★，Tacotron2 | 未核实 | 证明可以拿 IMDA 数据训 Singlish TTS，但模型很老，数据许可链也复杂。**不建议使用** |
| 12 | W3C COGA《Making Content Usable…》 | https://www.w3.org/TR/coga-usable/ | W3C 工作组说明（2021） | W3C 文档 | 认知与读写障碍的设计模式：熟悉的图标、每页一个任务、避免倒计时等。和 F13 一致 |
| 13 | LESLLA（低教育二语与读写习得） | https://lesllasp.journals.publicknowledgeproject.org/ | 研究论坛和期刊 | 开放获取 | 研究对象是低教育成人移民的二语习得，强调先建立口语。Strube 等人的研究只针对口语教学。总体证据"稀少" |
| 14 | Goh & Vandergrift《Teaching and Learning Second Language Listening》第二版 | https://routledge.com/Teaching-and-Learning-Second-Language-Listening-Metacognition-in-Action/Goh-Vandergrift/p/book/9780367254254 | 书（2021） | 版权书 | 元认知听力循环。批评"只拿理解题得分当进步证据"，这和 F10 的"不打分"一致 |
| 15 | Speak Good English Movement / IPS Singlish 调查 | https://linguisticanthropology.org/?p=5842 ；https://www.malaymail.com/amp/news/singapore/2026/05/26/singlish-use-rising-in-singapore-even-at-work-study-finds/221431 | 政策与调查 | — | SGEM 的立场已经转为"两种都可以，会切换就好"。IPS 2024 年数据显示职场使用 Singlish 的比例从 34.7%（2018）升到 41.5%，同时标准英语水平也达到十年来最高。这支持"听懂 Singlish，场合正式时用标准说法"的分层 |
| 16 | 新加坡移民成人英语项目 | SDI Academy / Linger（https://yale-nus.edu.sg/?p=7813）；NTUC MWC 基础会话班（2010）；Eversafe Spoken English Basic（15h，S$218，https://eversafe.edu.sg/course/spoken-english-basic-level/）；PSPC HELLO Class | 线下/应用 | — | 本地现有供给基本是课堂式的通用会话课，**没有找到按个人真实场景生成、以听为先的同类产品**〔推断，搜索覆盖有限〕 |
| 17 | 连续打卡证据 | Duolingo 官方博客 https://blog.duolingo.com/how-duolingo-streak-builds-habit ；Northwestern IPR WP-26-05 https://www.ipr.northwestern.edu/documents/working-papers/2026/wp-26-05.pdf | 公司材料和工作论文 | — | 打卡确实能提高留存，但数据主要来自公司自己。Khan Academy 撤掉了打卡；"断签后近六成会放弃"的数字找不到原始来源 |
| 18 | LLM 生成课程的人工审查 | Duolingo 课程生成流程 https://www.zenml.io/llmops-database/ai-powered-lesson-generation-system-for-language-learning ；LLM 课程设计综述 https://science-cloud.hu/index%2Ephp/publikaciok/review-large-language-model-enhanced-curriculum-design-e-learning | 案例和综述 | — | 一致的做法是"教学目标由人定，机器先做机械检查，人审语言的细微之处，并记录版本"。目前没有找到针对语言学习内容、经过验证的审查量表 |

## 3. 对产品的具体改进建议

费用口径："0"= 不新增模型或供应商费用（只有自己的存储和开发时间）。规模：S ≤ 半天，M 1–3 天，L > 3 天（AI 协作口径，〔推断〕）。

### P0

**P0-1 跨课程"复听"队列（只听不写，用 FSRS 调度）**
- **做什么**：把用户学过的课程里的 `phrases` 和学习者台词（或对方关键句）变成复听条目。每个条目直接截取本片原音（按已有的字幕时间切片，生成 API 调用为 0，符合 K6.2）。"我的场景"页加一个低干扰入口："今天可以再听这几句（5 句）"。播放顺序是先听原音，再选三档之一："没听懂 / 提示后懂 / 听懂了"，分别映射到 FSRS 的 Again/Hard/Good，不使用 Easy。母语释义沿用现有的"帮我理解"。
- **为什么**：现在的"回顾"按课程保存（lib/practice-reviews.ts），但没有隔几天再接触的机制；间隔重复是留存证据最强的学习机制之一。ts-fsrs 是 MIT 许可、TypeScript 写的，可以直接用，调度状态只有几个数字，适合 SQLite 存储。
- **边界**：自评不能当成能力证据（F10.5）。只显示"这几句可以再听"，不显示逾期数、不显示保留率百分比。每天上限默认 5–10 句，可以改。用户几天不来，下次也只推当天上限的句数，不堆积。被报告为"已停用"的句子（C9-5）自动移出队列。
- **改哪些文件**：新建 lib/review-schedule.ts（按 lib/practice-reviews.ts 的账号隔离和同源校验模式）、app/api/review-queue 路由、"我的场景"相关页面（app/use-learning-library.ts、app/course-records.tsx）、lib/my-data.ts（删除时连带删掉，并写进"我们保存了什么"）。
- **规模和费用**：M。费用 0；依赖 ts-fsrs（MIT）。
- **风险**：FSRS 的默认参数是用文字闪卡训练出来的，用在"带上下文的听力句子"上间隔是否合适没有验证〔推断〕。建议先用默认参数，把 `request_retention` 设在 0.85 左右（〔推断〕：比默认的 0.9 稍低，复听压力更小），等有试点数据再调。

**P0-2 本地表达的语体标注（补上 F4.2）**
- **做什么**：脚本合同的 `phrases`（必要时也给 `lines`）增加三个字段：
  - `register`：`standard`（通用英语）/ `sg-standard`（新加坡正式场合也常用的本地词，如 MC、HDB、form teacher）/ `sg-colloquial`（口语，包括 Singlish 语气词和句式）；
  - `useAdvice`：`say`（可以自己说）/ `casual-ok`（熟人、随意场合可以说）/ `hear-only`（听懂就好）；
  - `plainAlternative`：一句清楚的替代说法，只有 `sg-colloquial` 时必填。

  词组页显示小标签，比如"本地口语·听懂就好""新加坡常用词"，替代说法放进"帮我理解"。提示词规则：入门内容（L0–L1）每课最多 1–2 个 `sg-colloquial` 项，并且只能出现在对方的台词里，学习者的示范答案始终用 `standard` 或 `sg-standard`（对应 F4.1、F4.2 和 §6.5"不每句堆语气词"）。
- **为什么**：自检把 F4.2 列为"未满足"（first-version-audit.md:122）。SGEM 和 IPS 的资料支持"会切换"这条路线（资源 15）。
- **改哪些文件**：lib/generated-script.ts（schema、校验、提示词）、lib/lesson-contract.ts、句子/词组页组件（app/real-scene-course.tsx 一类）、tests/domain 的 c7 脚本回归夹具（加"学习者示范含语气词""colloquial 缺替代说法"等反例）。
- **规模和费用**：M。替身测试费用 0；真实生成时输出 token 会小幅增加（〔推断〕个位数百分比）。

**P0-3 逐条审查记录和最小审查流程（F4.4、F12.2 的前提）**
- **做什么**：
  1. 新建 `content/local-expressions.json`，约 60 条，见第 4 节。每条包含：表达、含义、`register`、`useAdvice`、关系与场合、替代说法、`review: {status: 'unreviewed'|'ai-checked'|'local-reviewed', reviewer, date, notes}`。
  2. 把 lib/scene-seeds.ts 的全局 `sceneSeedsReviewed=false` 改成每个种子单独记录审查状态（保留全局值兼容现有考题）。
  3. 写一个脚本，导出"审查表"（CSV，含英文、五语翻译、语体）给审查者，审完再导回来。
- **为什么**：spec 要求每个"本地用法已验证"的标记都要有审查记录；业内一致的做法是"机器先查结构，人审语言细节，并记录版本"（资源 18）。
- **规模和费用**：工具部分 S–M，费用 0。人工审查需要负责人招人：1 名新加坡本地英语审查者，加五种辅助语言各 1 名母语审查者，按小时计费，〔推断〕首轮各 4–8 小时，总额约数百到一千多新元，属于外部费用。

### P1

**P1-1 元认知听力循环（Goh & Vandergrift）**：观看前用母语问一句"你猜对方会先问什么？"，给 2–3 个可点选项（有图标，可以听），看完再回来核对一次。不计对错，只用于引导注意。改 app/guided-scene-copy.ts 和观看页。S–M，费用 0。

**P1-2 不制造羞愧的习惯机制**："我的场景"显示"继续上次：○○课 · 句子第 3 句"（已有 lib/scene-progress.ts 的指针），加一个单调递增的"已听过 128 句"（不会因为中断而清零）。周视图只显示"本周听过的天数"，不显示断签。提醒按 F15.2 后续再做，用户主动开启。S，费用 0。

**P1-3 无分数的轻量学习分析**：在本地 SQLite 记录事件：重放次数、慢速使用、帮我理解、选意思、报告。用途有两个：①在课程内显示"这句你重听了 6 次，可以加进复听"；②试点期间经用户同意后汇总匿名计数，找出"最多人重放的句子"，作为内容难度信号交给审查。不发给第三方分析 SDK（F14.4）。M，费用 0。

**P1-4 用户自己的复听条目和"未见问法"的低成本版（F10.2）**：复听里偶尔插入**另一门课里**意思相近的原音句子（同一种子类别、同语体），当作"没练过的问法"。这样不用新生成，费用 0；但能匹配到的句子取决于课程库规模〔推断〕。M。

**P1-5 每一段母语帮助都能听（低读写）**："帮我理解"和母语释义加播放按钮。先用浏览器 `speechSynthesis`（免费，但 hi/id/ko 在 iOS 上的声音和质量不稳定，需要真机测试）。正式版再用 TTS 预生成，会有小额费用，按句缓存。另按 COGA 检查：每屏一个主要动作、图标加文字、不用倒计时（已有）。M。

**P1-6 学习者举报和审查闭环的衔接**：C9-5 的"不像本地说法"报告直接进入 P0-3 的审查表，按 `register` 和表达名聚合。解决自检里的"没有全局审核流程"。M，费用 0（不含人工）。

### P2

- **P2-1** 向 IMDA 申请 NSC 或使用 MNSC，在 T63 真语音上线前，离线测转写在本地口音上的错误率，用来校准"我没听清"的阈值（F8.4）。M。许可要逐条确认；评估本身费用 0，转写调用另计。
- **P2-2** F4.3"换一个本地声音"的版本：只对**已审查**的高频句子生成第二个声音，按句缓存。有 TTS 费用（〔推断〕每课不到 1 美元）。
- **P2-3** 积累到〔推断〕每个用户几百次复听记录后，再考虑用 FSRS 优化器做全体参数微调，不按单个用户调。L，费用 0。
- **P2-4** SingDict 只作为审查者的参考链接；如果要摘录进产品，按 CC BY-SA 署名，并评估相同方式共享的义务。

## 4. 内容和本地英语的建议

### 4.1 按六类场景补充的本地表达（候选，**全部待本地审查**；释义来自我对新加坡用法的了解〔记忆〕）

| 类别 | 新加坡常用词（sg-standard，可以自己说） | 口语（sg-colloquial，入门阶段多数只要求听懂） |
|---|---|---|
| 饮食（S33–S36） | hawker centre, "Having here or take away?", "less sweet", "no ice" | kopi / teh / kopi-O / kopi-C / siew dai（少糖）/ kosong（无糖）/ peng（冰），tapau / dabao（打包），chope（占座），称呼 "uncle / auntie" |
| 交通（S25–S28） | tap the card, top up, MRT, interchange, "alight at …", "the next bus" | "Card cannot" = 卡不能用，"Go there top up can already" |
| 居家邻里（S29–S32） | HDB flat, void deck, town council, corridor, aircon, contractor | "Got water leaking from upstairs"，"Paiseh ah"（不好意思），"Can come and see or not?" |
| 工作（S13–S20） | MC（病假单）, on leave, OT（加班）, off day, "revert to you"（回复你）, soft copy / hard copy, follow up | "Can or not?", "OK can", "Settle already", "Don't have", "Is it?"（是吗？） |
| 诊所（S21–S24） | polyclinic, GP, queue number, MC, appointment, "Are you allergic to any medicine?" | "Wait ah, your number not yet" |
| 家校（S01–S12） | form teacher, Parent-Teacher Meeting / PTM, recess, CCA, PE, school bus uncle | "Your boy quite quiet one"，"Don't worry, slowly will catch up" |
| 通用语气词和句式 | — | lah / leh / lor / meh / hor / ah，already（表示完成），got / no have，where got（哪有），alamak，shiok，"Sorry ah, can say again?" |

**优先级**：先做"听懂就好"的高频项（语气词、can/cannot、already、got），再做场景专用词。至少下面这些**求助句**要标为 `say`，因为它们直接服务于"怕开口"的用户："Sorry, can you say that again slowly?"、"What does ___ mean?"、"Can you show me?"。

### 4.2 Singlish 和标准英语怎么标

- 三档语体（standard / sg-standard / sg-colloquial）加三档建议（say / casual-ok / hear-only）。界面文案用"新加坡常用词""本地口语"，**不使用"不标准""错误"一类说法**（spec §6.5）。
- 每条口语都配一句清楚的替代说法，并说明"正式场合（家长会、诊所、雇主）建议用后者"。
- 示范答案（学习者台词）默认不含 sg-colloquial；对方台词按内容档位逐步增加：L0 最多 1 处，L2 及以上可以自然出现。
- 带标签的口语如果出现在学习者示范里，校验器直接拒绝（加进 c7 回归夹具）。

### 4.3 审查流程（建议）

1. **机器层（每次生成都跑）**：schema 校验；用 local-expressions.json 加一份语气词表扫描英文，如果出现了表里的口语项却没有 `register` 标签，就标为待查；学习者示范里不能有 colloquial；台词长度和档位要匹配。
2. **AI 复核层（可选，有小额费用）**：用另一个模型检查语体标注、翻译是否忠实、医疗或手续内容是否越界。结果只能标为 `ai-checked`，不能标成"已验证"。
3. **人工层**：36 个种子和表达库 100% 审。生成的课程每类抽前 N 门（〔推断〕N=5），再加上所有被用户举报的句子。五语翻译由母语审查者审。审查记录写到条目上（reviewer、date、notes），按 F12.5 修复时生成新版本，不覆盖原版。
4. **界面**：只有 `local-reviewed` 才能显示"本地审查过"；其余继续显示"AI 生成，未经本地审查"（现有做法）。

## 5. 不建议做的

- **连续打卡、XP、排行榜、断签惩罚**：违反 F15.1 和 §6.3。支持打卡的证据主要是公司自己的数据，Khan Academy 已经撤掉；对怕开口的近零基础用户来说，羞愧风险大于收益〔推断〕。
- **Anki 式的文字闪卡、拼写或打字题**：产品明确不训练读写；低读写用户也无法操作。复听只用声音加图标。
- **嵌入 Anki 代码或导出 .apkg**：〔记忆〕AGPL 许可加桌面架构不适合嵌入；目标用户几乎不会用 Anki，导出功能投入产出低。
- **显示保留率、能力百分比、"掌握度"**：自评三档不是测量；违反 F10.3、F10.5 和"不打分"的原则。
- **用现成的 Singlish TTS（如 sil-ai/tts-singlish）或自训 TTS**：模型老，许可链复杂，质量没有验证；本地声音应该走已审查的供应商声音，加人工听审。
- **把 SingDict 或 LLM 生成的 Singlish 释义直接当成权威内容**：它们本身就是"LLM 生成 + 部分人工审查"，CC BY-SA 还会带来共享义务。
- **默认生成大量 Singlish 的对白**：入门用户会被淹没（F4.3），正式场合用了也可能失礼。应该"先听懂，再按场合选择"。
- **过早针对单个用户优化 FSRS 参数**：数据不够，容易过拟合；先用默认参数加保守的日上限。
- **引入第三方分析 SDK 追踪学习行为**：与 F14.4 的隐私承诺冲突；轻量分析留在本机或自有库，汇总前需要用户同意。
- **把听力元认知、间隔重复对"近零基础移民成人"的效果当成已证实**：两者的证据都来自其他人群（大学 EFL 学习者、闪卡用户）。试点时要单独观察，不能写进营销承诺。

---
来源（除上表外）：IMDA NSC 许可说明见 Interspeech 2019 论文 https://www.isca-archive.org/interspeech_2019/koh19_interspeech.html ；COGA https://www.w3.org/TR/coga-usable/ ；LESLLA 综述 https://jyx.jyu.fi/jyx/Record/jyx_123456789_57784 。
