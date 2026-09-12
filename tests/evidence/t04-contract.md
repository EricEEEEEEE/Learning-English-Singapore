# T04 红考题合同

依据已批准 `spec.md` F2.3–F2.5、F10.5、6.2，`tasks.md` T04；B1 本地原型范围。

## 交付与接口

`lib/placement.ts` 导出纯函数 `evaluatePlacement(evidence, options)`、`profileFromOnboarding(session, asOf)`、`createStudySettings(profile)`、`applyStudyAction(settings, action)`、`refreshStudyRecommendation(settings, profile)`。导出名仅为本轮接口合同，题目关注输入后的可观察结果，不指定内部实现。

`evaluatePlacement` 输入为已采集的题目首次响应快照：稳定 question_id、band、topic、task_type、tags、first_response、首次响应之前的正常播放/设备故障/完整答案/母语整句解释、answer_needed（实际尝试后仍需示范）、重听数、来源与内容审查状态、本地 voice 身份与审查状态、是否额外冲突题、证据时间。首次快照不被 latest_response 或答题后帮助覆盖。同题重答不增加独立证据；同一快照的标签不拆为多道题。

输出含规则版本 placement_rules_v1、listening_band、placement_status、recommended_content_band、evidence_confidence、support_level、local_listening_familiarity、speaking_status、evidence_date、逐题证据/排除项、支撑记录、按稳定 task_type 的成功/失败证据、未确认档与补题请求。不生成总分、CEFR 或完整口语结论。证据时间为调用者显式提供的 as_of，不依赖测试运行时的时钟。

## 规则与边界

- 无足够可靠证据：listening_band=null、placement_status=unknown、内容L0、充分支撑；口语unobserved，本地声音unknown。
- L0：至少两个不同基础题实际尝试、正常播放、仍需答案示范。单纯答错、跳过、只点帮助、未播放或设备失败不够；L1不以L0为前置。
- L1至少两个不同题目和主题的独立成功。L2、L3逐档补齐前置与本档两条；L4还需两条独立成功同时覆盖两个主题和两个不同已审查本地voice，不强加四格交叉样本。
- 自行重听仍可独立成功，但保留次数。回答前得到答案/整句翻译、未正常播放、设备失败、未审查内容、simulation全部排除独立分母；跳过/未知/未答也排除。晚到播放不得补造首次已播放事实。
- 同档、同稳定task_type出现成功/失败冲突，最多一道不同question_id的补题；成功仍须满足两个主题与所有前置，置信度reduced；失败/跳过/未知/仍不满足条件时保留未确认档，采用最高无冲突支持档。不能第二道补题覆盖第一道失败。此处“不同措辞”由不同稳定question_id且已审查的fixture代表；真实措辞区分度及voice本体差异仍须T08内容/音轨审查，本轮不宣称已完成。
- `options.previous_extra_question_ids` 是此前已用额外题的稳定ID总账，可包含本次 evidence 中的 followup ID。预算按该集合与 evidence 中 is_followup 的**唯一ID并集**计算，最多4；重复ID不重算。测试覆盖先可选2＋再冲突2耗尽、重叠ID不双计、已满4与用户ended均不再请求。没有新预算开关。
- 暂定能力结果为provisional；规则本身尚未真实成人校准。fixture source=observed 仅为离线算法输入，不是现实研究结果，不进入产品UI。

## 原型接线与用户调整

T03 的真实存档记录仍全部是 simulation、eligibleForAssessment=false。`profileFromOnboarding` 必须保留这一事实：即使全部模拟播放并选择，也保持unknown，独立证据0；7道听音题排除项和帮助记录可追溯。偏好题不是能力证据。

引导结果保留现有摘要，并有四语“学习起点与帮助”区域，分开展示目前能听懂的内容、说英语尚未了解、当前练习设置和无真实证据说明。只显示产品可理解文字，不把内部规则/类型/测试控制术语散落在主流程。

用户可更简单/更自然、慢速/自然速度、减少提示、恢复建议、标记反馈有误。`StudySettings` 分开保存 recommended 与 chosen；恢复指**当前规则建议**，不是上次手选。用户手选不改写听力证据或口语；更新引导、完成附加题、切语言、刷新均不悄悄清空手选。`refreshStudyRecommendation` 接受新档案，更新推荐但保留已有手选和反馈；无手选覆盖时跟随新建议。domain用L1→L2验证恢复指向新建议，不以始终L0的UI结果代替此边界。反馈标记保留、恢复设置不清除它，也不自动降级。

设置存储key为 `le-sg-study-preferences-v1`；写失败显示本次可继续，后续写成功清掉保存失败提示。读取失败保留原始bytes，本次调整临时有效。四语文案仍为待母语审查的试验版；没有真实音频变速或播放，不得暗示已执行音频。

## 回归与证据纪律

新增3种损坏引导记录用例（invalid JSON/null/不支持题目ID），证明重新预览、选择、暂停、恢复、再刷新不覆盖旧bytes。沿用102旧题，原有断言不放宽。T04新增domain与浏览器题；三浏览器项目各运行UI，domain仅一次。

先实际运行缺少模块/缺少结果区域的红探针，保留exit、日志与失败截图；独立审题后登记red。红档真实回执前不写实现。未实际运行的题只标已收集，不声称通过；已存在的损坏记录回归应实际跑绿。实现后全量verify及独立复验，真实绿档回执才记T04存档。
