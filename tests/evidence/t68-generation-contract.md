# T68 · 同版需求到真实任务状态红合同

依据已批准C2F、spec K3/K4/K7及实施方案。T67绿回执1e1019c5b9已核实，先复位test-writing。本任务不启动worker或调用供应商，不改授权预算、密钥、规矩或旧课程。

## 用户行为（本次5项交付）

1. 六关键词页保留可单独“保存需求”，增加主要动作“生成场景”。点击后先确认当前原描述、六字段与帮助语言作为一个版本保存；保存失败/冲突不能创建任务，不带旧快照偷偷生成。生成提交期间不接受新的生成点击，提交前的短暂保存阶段保持本次输入一致；不影响单独保存时继续编辑的T67行为。
2. 独立状态页面使用同一根路径的`?generation=N`标记需求版本，支持刷新、前后导航和直达；版本来自服务端保存结果，不接受URL/localStorage作为身份或完成证明。初次有明确点击才POST；仅刷新或打开链接只能GET，不自动新建任务。
3. 服务端按签名会话读取指定不可变需求，任务持久保存该快照，owner/需求版本/所有关键词共同决定任务身份。同版并发/重试只产生一个任务；修改任一字段成为新需求版本则建立新任务，历史任务不被改写。旧版同描述任务和旧聚会课程不能冒充这个新输入的结果。
4. 页面只显示真实阶段，不显示假百分比。提交回执未知后查询原需求关联的任务，不自动第二次POST；查询失败或超时可“重新检查”，返回修改保留输入。账号变化、失效、迟到结果不得串入另一账号；非终态可有界周期GET，页面隐藏暂停查询；任何查询都不能执行生成。
5. 只有非模拟任务绑定正确需求，并通过既有私有课程读取/材料/媒体完整性检查才出现“观看场景”；打不开材料或媒体时可重查、不可回退到酒店/聚会样片。观看按钮打开对应的已存课程，复用既有播放器；观看后的角色学习交互仍由T69整理。无课程时如实停在“尚未生成”。

五种辅助语言沿用；不引入问卷。URL无效/需求不存在提供返回，不能凭页面参数生成或把他人任务显示出来。我的场景与学习位置由T70接续。

## 内部契约（可逆实现选择）

- `lib/scene-generation.ts`导出`createSceneGenerationService({requirements,tasks})`；`get({cookie,now,requirementRevision})`只读，`submit(...)`只创建持久任务，不运行provider。返回`{requirement,task,phase,course}`；未提交时task/course为null，phase=`not_submitted`。
- 复用T67需求库及现有generation store。扩展generation store的内部`create`为可接收服务端`requirement:{revision,content}`，校验goal.trim()==requirement.content.description.trim()及revision一致；既有task.goal继续trim，但完整快照的原始空格/换行不改写，并进入指纹。其指纹与旧任务分开，覆盖完整内容。新增`findForRequirement`按验证cookie+完整快照读取，默认local-course-store透传该内部方法。旧API的goal/revision/requestKey路径保持旧语义，不接受客户端传入requirement作为内部授权。
- service先从requirements.get读取**指定历史版本**，不以最新版本替换；再查/建对应task。内部稳定requestKey仅用于幂等，不是身份。task原goal仍为描述，结构化背景保存在requirement，实际脚本消费它属于T71，不称本次已自动生成。
- task公开投影仅`id,revision,requirementRevision,status,simulation,providerCalls`；不返回owner、cookie、数据库路径、预算或供应商ID。phase为`not_submitted,awaiting_budget,submitting,submission_unknown,script_ready,audio_ready,audio_assembled,video_pending,failed,simulation,media_unavailable,ready`之一。视频任务失败映射failed；模拟任务不可ready。不可识别或来源不一致的数据拒绝，不降级猜测成功。
- `video_assembled`仍须tasks.getCourse({cookie,now,id,revision,materialsRevision?})成功，并核对course.id/revision/media归属/source为ai-generated；该既有方法实际验证课程与私有媒体字节，不能只看status。成功才返回course指针`{id,revision,materialsRevision?}`；失败返回media_unavailable且course为null。无需再生成媒体。
- 若验证时指定了materialsRevision，须原样包含在观看指针，不能验修订版却播基础版。GET“只读”限定为零新任务、零新增预留、零worker/provider；保留既有失联进程恢复为submission_unknown的落库语义，不断言磁盘零写入。
- `app/api/scene-generation/route.ts`导出`handleSceneGeneration(request,{service,now})`，实际配置本地T67库及默认generation库；GET严格单个`?revision=N`且不要求Origin，POST body仅`{requirementRevision:N}`且同源Origin必需，流式体上限1024字节，超额取消；所有私有响应no-store。401无会话、404本人需求不存在、400参数/未知字段、403来源、413体积、405方法、503通用故障。配置缺失或Vercel仍拒绝本机伪持久化。
- 浏览器校验需求版本、task来源版本、course指针必须匹配；GET/POST有界超时含读JSON。提交未知只能GET恢复；重新检查不是创建重试。刷新从query恢复，返回不丢未提交编辑，不强制用户重做登录/问卷。
- 历史N的状态页返回时保留较新/未保存工作稿，不能把状态页快照N覆盖到编辑器。回执未知且首次GET暂无任务，只能说明暂未查到，不能自动POST或断言永久失败；后续GET可找到原任务。
- 显式生成顺序为：需求保存成功取得版本 → 把该版本写入状态页query → POST创建并等待回执。如此ACK返回前刷新仍可仅GET找回原任务；query不是身份或创建授权。

## 验证与边界

domain使用真实本地需求/任务库验证快照、持久性、并发、身份、幂等、零provider；状态/ready投影另外明确使用可观测读取替身（成功替身不等于真实媒体通过），检查实际getCourse调用与错误拒绝。HTTP测试调用真实handler/default配置；浏览器替身验证页面契约，完成后另用真实Next HTTP补查联通。

同时给T67补两条永久浏览器回归：临时session503后恢复同账号未保存原描述与六字段且不重读覆盖；同账号PUT在途编辑不被ACK覆盖且不误报已保存。这两条是已实现保护的补证，预期当前通过，不伪称它们重新跑红。旧题和阈值保留。

当前真实新生成、收费worker、5–8分钟、自由语音与云库不在本题内。状态awaiting_budget是真实未开始，不能命名为已经生成或用旧片填补。所有数据虚构，实际供应商请求0。

## 红阶段实跑与独立审题

- 发现清单`npm --prefix tests run list` exit0：1309项/103文件；相对T67的1180新增129项，其中T68 domain45、UI26逻辑×3视口78，T67补证2逻辑×3视口6。不是1309项全量已执行。
- domain45项实际运行，exit1、45失败，日志`.loopwork/logs/t68-domain-red.log`。失败主因为新service/route模块未实现；因此证明可收集且当前不具备约定入口，不冒称45条内部断言已经走到。实现后须逐条运行通过。
- 首组选跑phone6项：T68生成保存、链接只查询、媒体不可用不冒充、迟到旧账号GET四项失败；T67临时session503保留草稿、保存中继续编辑的ACK保护两项通过。exit1，22.2秒，日志`t68-phone-red-and-regressions.log`；两项回归原断言未删，仅新增40行。
- 新增phone3项：迟到POST切账号、JSON读体超时、隐藏暂停与可见恢复均失败。原模拟设计经只读审题纠正后完整复跑3项，exit1，日志`t68-phone-additional-final-red.log`；原因分别是生成按钮缺失、未发起状态JSON读取、状态文案缺失。初次`t68-phone-additional-red.log`保留，不重复计数。
- 不同新用例实际共54项：T68预期失败52、T67回归通过2；其余75项未运行。无环境失败冒充业务红，无改app/lib/spec/rules/hooks，无新增模型调用、费用、密钥操作或发布。
- 独立只读判卷员复核5项合同及新增3题，通过**红卷设计限定审查**，未替主向导运行测试、不称实现验收。纠正了JSON替身的Request/URL/signal语义及hidden/visibilityState一致性，并用浏览器时钟推进9000ms覆盖允许的8000ms轮询窗口；未放宽原断言。迟到A POST携ready及材料版本3，切B后无观看入口/课程/媒体读取。
- 八项检查：空转修复、断言放水、断言消失、吞异常、抑制检查、假重构、查表蒙混均未命中；功能孤岛未见于设计，实际联通待实现后真实HTTP补查。合成JSON/visibility不是操作系统后台或真实流式网络实测；ready浏览器替身与酒店媒体字节仅测指针接线，不证明新场景已生成。
- 剩余验证边界：默认真实Next HTTP、私有媒体字节、跨进程提交竞争和完整verify须在实现后补齐；本次不替代T71新场景生成和后续母语文案审校。

红档登记后以Stop实际回执为准；收到前不写实现。
