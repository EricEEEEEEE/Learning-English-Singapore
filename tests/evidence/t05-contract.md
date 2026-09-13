# T05 红考题合同

依据已批准tasks T05、spec F3.1–F3.5/F9.1/F14.1/F14.2、7.3及plan 5.2。B1只做明确标识的离线流程，不接真实语音输入、规划器或媒体生成。

## 场景与候选

三类起点school/work/daily与规划候选分开；始终保留“都不是，我想练……”入口。未登录可经引导结果进入场景预览。辅助语言原文作为文本保存和展示，不执行HTML。

清晰目标进入确认界面；3个离线候选首屏最多3个，默认保留原意，可换一个练习重点。每个候选含稳定id、user_goal、focus、possible_intents、open_branches、source_refs、grounding_status、unknown_facts、complexity_budget。本批候选是明确说明的通用沟通流程演示，不表示真正理解任意需求。自定义原文保留，grounding_status=user-provided且source_refs为空；机构实际安排、时间、人员意见等未核实事实保持未知。种子只可引用现有spec中实际存在的来源或段落，不能标为真实教材审查通过。

确认卡分别显示和谁、在哪里、希望办成什么、最担心哪一步，并允许逐个修改。缺少目的时仅问这一个必要问题；其他缺项可为null/待确认。无需真实姓名、学校、雇主或病历。确认前不启动准备。选择一个不同focus应改变示例步骤与练习提示，不能只改变卡片标题。默认“先说明来意”，另外提供“多问一个细节”和“听不清时求助”；浏览器实际点击非默认候选，比较步骤/提示列表项，不能只靠动态标题通过。

## 确定性接口

`lib/scenario.ts` 导出createScenarioSession(learningContext)、applyScenarioEvent(state,event)、readScenarioSession(raw)。context保留T04手选content_band/speed/support，以及unknown listening和unobserved speaking。语言仅控制界面和种子文案，不改写用户原文或制造新版本；choose-start事件可携带当前辅助语言供种子本地化。

状态包含schema=1、stage、draft、clarification、versions、active_version_id。stage覆盖choosing/describing/clarifying/confirming/preparing/partial/ready/cancelled。clarification是单一{field:'goal'}或null。draft含origin、description、who/where/goal/worry、来源/未知事实、3候选及当前候选。

已确认版本含稳定id、goal_revision、user_goal、learning_context、source='simulation'、real_media_ready=false、plan.steps/plan.practice_prompts/plan.focus、unknown_facts、preparation、artifacts和request_id。所有“ready”只表示模拟步骤，不是真实资产成功。UI一贯标“流程演示／尚未接入”，不显示虚构倒计时或“生成成功”。

事件：choose-start、describe、clarify、edit-field、choose-candidate、confirm、edit-goal、demo-step、cancel、retry-failed、view-version。编辑中的草稿与已确认版本分开；reducer不得修改输入，重复confirm不新建版本。

## 准备、重试与版本

准备有序：dialogue→media→check。显式的演示控制触发模拟就绪/失败，不调用真实生成或媒体播放。检查通过后显示场景草稿预览；不是实际课程或视频。

每次确认分配新goal_revision与新request_id；改目标或focus后实际步骤和练习提示变化。旧确认版本与已成功资产不覆盖，用户可查看旧版本，刷新后仍在所选版本。从旧版本再分支使用整个session的下一个revision（A1→B2→从A再改得C3），不能复用2；查看旧取消版本不复活它，也不改变新版本正在准备的阶段。

失败可只重试失败部分，成功部分的内容、标识和版本保持；重试生成新request_id，旧尝试迟到事件不能完成新尝试。乱序步骤、重复完成、非当前版本的事件不能推进状态。取消后刷新仍取消且保留成功部分，迟到完成不能恢复成功。A准备中改目标确认B，A迟到消息不能改变B。真实供应商取消和幂等另等后续实测。

本地key为le-sg-scenario-v1；恢复同一目标/版本/准备阶段。读取失败保留旧bytes，可临时新预览但不写回原key；保存失败明确说明本次仍可继续。readScenarioSession拒绝损坏JSON、未知schema和失效active_version引用，不静默返回新空场景。

## UI与回归

四语场景确认、准备、取消、失败/恢复文案；用户自述内容切语言后原文不变。沿用成人布局、图标、>=44px按钮；确认卡、取消和版本预览在手机/桌面无横溢出。原167冻结断言保持不动。

新增T04回归：3种前后帮助/播放时序，累计prompt_play_count/answer_exposed/device_failure与首次before快照同时保留；真实Tab遍历进入设置控件，再Enter调整、Space恢复。不会以直接focus替代Tab路径。

考题先真实跑红（缺scenario模块/场景入口），已有两类回归实际跑绿；独立审题通过才登记red。真实red回执前不写实现。原型通过不表示真实任意任务生成、语音输入、媒体资产、母语审查或真人研究通过；真实生成T14继续验收。
