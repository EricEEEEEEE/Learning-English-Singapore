# T70 · 我的场景与本地学习位置恢复

已核验T69绿回执9d6a51f614（28/68、本圈第8轮），复位test-writing。依据已批准C2F T70、spec K6和docs/proposals/simple-scene-journey.md；不接收费worker、云库、自由语音，不改密钥/规矩/发布。当前真实浏览器只显示登录选择，不能把历史“已登录”当成本轮有效目标身份。

## 完整任务的5项交付

1. 已登录主页面保留一个低干扰“我的场景”入口，原输入为主体。列表来自已验证会话的本地私有生成库/授权副本，只开放实际材料/媒体可读且非模拟的课程；未生成任务、坏媒体不冒充成片。列表错误不伪装空库，返回输入保留草稿。五语、手机/桌面、加载/失败/重试有可见反馈。
2. 课程指针、历史需求/角色、材料版本和媒体哈希一致。新需求用服务端原快照；历史副本没有背景资料时明确标无历史角色资料，沿用中性回应者，不挂当前草稿或编造角色。复用T62A复制授权边界，不改原owner、不自动导入给未确认身份。旧副本不带完整背景的事实必须保留。
3. 本地持久保存观看时间、当前页（watch/role/terms/sentences/prompt）和回合；刷新/重新登录后从“我的场景”恢复同版位置。恢复始终暂停，不自动发声/开麦，不把看过、跟读或进度当能力。词句页不承诺恢复滚动像素或熟练度。进入提示接话的明确点击仍由对方先说，恢复提示页不自动重播。
4. 服务端Cookie确定owner，进度同时绑定id/revision/materialsRevision/媒体SHA；不同材料、不同媒体与不同账号不能混进度。先读后写、冲突可恢复；未知ACK仅恢复/等价重试，不用旧快照覆盖新位置。退出/换号/未知会话隐藏旧库和播放器、停止旧媒体，迟到读取或保存不能回写另一账号。文件损坏/写失败保护旧记录，显示本次临时学习状态，不假报已保存；有界网络等待可重试。
5. 重学只用已有私有媒体和读取/进度API，生成请求与供应商调用0；实际Next默认HTTP/SQLite/私有库和真实媒体补证，不只协议替身。真实账号副本及退出重登依T62A要求另核验：现有登录已退出，等实现可操作后请用户完成普通Google登录，确认有效目标会话再绑定已有聚会课程，不能用合成身份充当真人验收。本机保存不称跨设备云库。

## 最小接线与分段红票

本任务包含持久库、HTTP及浏览器三层，按三段考题分别先存红票再实现，整条T70只在所有交付及真实依赖满足后勾选。当前首组只写进度存储考题，不声称完整UI/HTTP覆盖或T70已验收；后两组在各自test-writing阶段补红，不能实现后再补题。

- 首组：`lib/scene-progress.ts`的`createSceneProgressStore({directory,sessionSecret})`。复用Node内置SQLite，独立`scene-progress.sqlite`，不迁移/覆盖已有需求、任务、媒体。内部get/save接实际已核验课程与签名会话；latest返回本人同id/revision最近明确学习的完整材料/媒体指针，不能因新增翻译版自动切到新材料。键包含owner/id/revision/materialsRevision（无修订材料时保持undefined）/媒体SHA。位置仅page/time/turnIndex，版本为乐观并发序号，等价重试返回原结果，不接受播放/录音/掌握标记。保存开始先复制输入，验证前后不受调用者异步修改影响。
- 第二组计划：私有课程目录service复用createLocalCourseStore，不暴露执行方法。实际读取每个成片并核验来源、材料/媒体、历史上下文；latest旧材料指针需再经真实getCourse验证，缺失不可退到最新版本或公用样片。GET本地库，GET/PUT进度；同源必需、严格字段/选择器/体积、通用私有错误、无Store/Vercel503、有界请求。字段名与位置协议固定后补红，不改变首组断言来配合实现。
- 第三组计划：低干扰库页和可恢复播放器；将服务端进度转为暂停的页面/时间/回合，单个串行保存器合并频繁timeupdate，显式切页/暂停及时保存；任何读取未知/失败不可用默认0覆盖原记录。普通生成观看及库入口共用进度，旧/demo不新增持久行为。语言切换、focus/503、同A新会话、A→B迟到、冲突/坏媒体/损坏存储均补回归。实际媒体起止和恢复无自动播放另证。

以上为批内可逆实现选择，无新方向或费用决定。新增状态只记学习位置，不增加考试、读写、积分或社交。已有50任务上限沿用，课程目录不新建另一套生成任务。真实目标账号尚无有效会话，不因该外部依赖阻止首组零费用开发；T62A/T70整体验收不能提前勾选。

## 首组考题预期

覆盖空状态、fresh实例重开、同身份新签名恢复/另一owner隔离、缺失/伪造/过期会话、course/材料/哈希隔离、最近明确使用版本、等价重试、过时/未来写入冲突、两个独立store实例并发、5种页面、非法时间/步骤/回合/额外字段、损坏库不重置和异步输入快照。

本组使用合成课程对象和签名会话，SQLite真实；第二合成turn只检验索引状态，不证明第二段媒体存在。并发是两个store调用并发发起、真实事务序列化，不称已强制跨进程锁争用。自然播放、签名HTTP、真机及真人OAuth不由本组证明。

独立审题补强：无materialsRevision的原始课必须保持undefined并与修订版隔离；同一now连续学材料3→4→3仍以最后明确保存为准，不能只用毫秒时间和初始rowid误选版本；未来expectedVersion即使内容相同也拒绝，不能拿等价重试绕过未来版本检查。合法SQLite中坏记录和真实写失败由后续补题/HTTP及实际QA继续覆盖，不能用本组坏文件头证明所有故障。第三组需将真实播放器容许的codec尾差按已核验课程长度规范化再保存，保留本组超时长严格拒绝，不改阈值配合媒体。

NOW先执行首组确认实际红，记录发现/执行数量与exit；独立只读审题后仅登记red，实际回执到达才写实现。

## 首组实际红结果

- 初版清单1396项/105文件，exit0；首组27项实跑exit1、27失败，均为预期缺少`lib/scene-progress.ts`。日志`.loopwork/logs/t70-progress-red.log`，不是既有服务或端口失败。
- 独立审题要求补原始无修订材料、同毫秒3→4→3最近选择及未来版本同内容拒绝；原27题未删改，新增3题。最终清单1399项/105文件exit0；最终首组30项实跑exit1、30失败，日志`t70-progress-final-red.log`，每项均明确缺新模块。重复运行不累计为57个新用例。
- 该红证明新持久进度能力不存在；尚未走到后续位置、隔离、冲突或损坏断言，不把模块缺失当作这些分支已逐个验证。当前旧1369项未在本红阶段重复运行，沿用T69既有全绿历史，不称1399全绿。
- app/lib/spec/rules/hooks/.codex与既有考题无改，diff检查exit0；当前只新增本组考题、合同及台账。没有新实现、模型调用、费用、凭据变更或发布。完整T70及真实目标身份仍待后续，不勾选T70。
- 独立只读四段审题限定通过首组5/5，核对最终红日志，未亲跑verify；八项作弊未见命中。合法SQLite坏行、真实写入失败/界面误报保存及恢复提示页无自动发声仍须后续补证；当前store B命名空间隔离不代表B获得课程访问。NOW只登记首组red，等实际回执后实现。

## 第二组：私有课程目录与进度HTTP合同

已核验首组实现记事32a88ae06d后复位test-writing，首组30题保持不动。当前仍不接UI、不复制到真实账号、不勾T70。

1. `createLearningLibrary({courseStore,progressStore})`仅接本地私有list/getCourse及进度latest/get/save。目录返回`{scenes:[{course,description,duration,requirement,contextSource}],unavailable}`；只列实际读到的非模拟成片。坏媒体/材料以unavailable计数，不伪装空库或换旧样片；列表读取失败向上传播，过程中鉴权拒绝不能变成可见的部分私人目录。只投影学习必需字段，不传owner、job、预算、Cookie或身份。
2. 目录优先本人最近明确学习的材料/媒体指针，再实际getCourse核验；旧材料不可读或媒体SHA变化就不可用，不悄悄用新版。新任务带原历史requirement；有资料却非法/错版不能退成无资料。历史copy无完整背景则`contextSource=legacy-neutral`，用原记录可用标题及空角色生成仅供播放器读取的上下文投影，明确不是原始关键词资料，不读当前草稿或猜角色。
3. `getProgress/saveProgress`先用Cookie及精确指针实际getCourse，验证course/revision/material/media/台词和翻译，再进度get/save；失败不得碰进度库或覆盖旧值。异步读课前复制调用参数。进度record不从客户端接媒体SHA或owner。目录/get/save均不提供生成执行方法。
4. `/api/learning-library`只GET，无查询参数；`/api/scene-progress`GET以id/revision/可选materialsRevision精确读取，PUT只收`{course:{id,revision,materialsRevision?},expectedVersion,position:{page,time,turnIndex}}`。严格正整数/安全值/字段及重复参数，不允许owner、SHA、playing等字段。PUT必须同源Origin（NextURL loopback别名以真实Host核对），流式按UTF-8字节上限2048，不信Content-Length。返回private/no-store；401/404/409/400/413/503等仅通用错误，不泄内部内容/路径。网络停滞的客户端5秒读体期限由第三组验证，本组不声称服务端流式处理有独立时间上限。
5. 默认配置仍用本机tmp/generation-tasks的既有生成/授权copy库、媒体库及新进度库，无新配置或密钥；缺secret/Vercel环境503不称云持久。配置函数考题用合成双身份授权copy、真实本地SQLite/字节哈希及新route调用验证默认接线和隔离，不当作真实Next网络/媒体解码/真人OAuth。后续实际HTTP和播放器QA仍必须。

本组另补3条首组实现的永久回归：合法SQLite坏JSON、非法位置不被重置，及真实SQLite UPDATE触发器RAISE造成写入失败后旧值保留、随后合法保存可继续。该触发器只在新合成QA库内，不删除/重置原数据，不等同磁盘满/EIO。初步3项通过应称既有实现回归，不冒称新能力红；新增service/HTTP缺模块失败尚未到具体分支断言。

服务协议fixture仅替代课程读取边界，实际签名会话与进度SQLite是真实的；源字节完整性沿用已有getCourse的实际验证，并在默认copy接线与最终真实HTTP另证。角色/字幕合成数据不算新生成内容或学习成效。

审题澄清：既有GenerationTask.requirement本来可选，缺背景兼容范围包括原生成课与授权copy，不能仅按copy前缀猜是否历史。对完全未记录背景的课程提供同一种显式neutral投影，页面应说“角色背景未记录”，不据缺失断言年代或丢失原因；并非声称已恢复原始需求。资料存在但非法/错版仍拒绝。service.list本身的存储/鉴权错误必须继续reject；默认匿名目录GET、进度GET/PUT均验证401，不以mock错误映射代替实际Cookie边界。

## 第二组实际红结果

- 初版42项exit1：39项新service/HTTP缺模块预期红，3项既有SQLite保护回归通过，4.5秒；清单1441项/108文件exit0。补源数据错配与会话中途失效2题后44项exit1：41红3绿、4.8秒，日志`t70-stage2-final-red.log`。
- 审题后再补service.list鉴权/存储错误不伪空库2题及旧生成课无背景中性兼容1题；另在既有新题中补实际缺Origin、默认匿名目录GET和进度PUT。最终47项（service25、HTTP19、存储故障3），exit1、44项缺新模块预期红、3回归通过、5.5秒，日志`.loopwork/logs/t70-stage2-reviewed-red.log`。清单1446项/108文件exit0，日志`t70-stage2-reviewed-list.log`；不同新增用例为47，不累计重复执行次数。
- 44红均明确缺`lib/learning-library.ts`或`app/api/learning-library/route.ts`，尚未走到具体service/HTTP行为断言，不作这些分支已验的证据；3绿真实执行了既有存储保护。当前app/lib/spec/rules/hooks/.codex及所有旧考题无改，diff检查exit0；旧1399项本红阶段未重跑，不能称1446全绿。
- NOW仅登记第二组red，实际回执到达才实现service/HTTP；T70不勾选，真实HTTP网络、UI、暂停恢复及真人绑定/重登仍待后续。不调用供应商、不增加费用、不碰密钥或发布。
- 独立只读最终四段审题5/5通过，列表伪空库/默认匿名访问等条件已补齐，八项作弊未见命中；审查者核对新增断言、合同与日志，未亲跑测试。盲区仍包括恢复页误自动发声、网络停滞后误报保存及真人重登，第三组另补；本红卷不构成完整T70验收。

## 第三组：我的场景与暂停恢复界面合同

核验第二组实现 note `8a065740f4` 后复位 test-writing；既有 app/lib 和考题保持不动。本段仍是已批准 C2F T70 的零费用开发，不接自动生成、收费执行、云库、自由语音或新密钥。

1. 场景输入为主体，仅增加“我的场景”次要入口；主动进入后才读 `/api/learning-library`。列表只显示返回的可读课程，后台不可用计数明确显示。源请求失败有重试，不能显示假空库；返回输入保留未保存草稿。五种辅助语言的入口、返回、目录错误及临时学习反馈有正向可见断言，手机不横向溢出。
2. 打开课程使用目录的精确 id/revision/materialsRevision 和 requirement，不借用最新草稿。无资料 neutral 显示“角色背景未记录”，不编造角色。课程仍通过原私有 JSON/Range 媒体入口；错误不换公共样片。进度响应须对应课程、材料、媒体 SHA，合法版本和课程范围内的位置；坏记录视为无法读取，不当作 null 或自动覆盖。
3. 从同版进度恢复 watch/role/terms/sentences/prompt、time、turnIndex；恢复不调用 play 或麦克风。真正点击进入提示接话时对方先说，恢复该页不自动说。刷新后从“我的场景”恢复，同 A 临时 session503 后恢复原课程、页面、时间及回合且暂停；确认换号/退出后旧课程不显示。全课程容器可安全保留为隐藏状态，不强制某种 React 卸载策略，但旧媒体必须暂停。
4. 普通生成观看和库内观看使用同一进度接口，旧 `/demo` 保持独立。进度 GET 完成前或失败后不得以默认位置写回；可临时学习并重试读取。位置保存只发 `{course,expectedVersion,position:{page,time,turnIndex}}`，不传 owner/SHA/playing/能力；单条保存串行，合并高频 timeupdate，保留最新明确页面及位置。允许的 codec 尾差在保存前按已核验课程长度规范化，不放宽服务端越界限制。
5. 保存成功才显示已保存在本机；503 不改旧记录、不报成功，重试后可继续。已提交但回执丢失，恢复或等价重试不重复加版本；随后产生更新位置也必须保留最新值。其他页面冲突提供重新读取，不强盖原记录。目录、课程 JSON、进度 GET 和 PUT 包括 JSON 消费在内均有 5 秒客户端期限，并实际验证重试/重新进入可恢复。A→B 后迟到目录、进度读取和写入回执不能回显 A 或给 B 写 A 数据。学习只新增读取/进度 PUT，不提交生成或需求保存。

### 考题与替身边界

`tests/e2e/t70-learning-library.spec.mjs` 有 24 条逻辑题，在三个既有视口展开为 72 项。`tests/e2e/t70-fixture-sanity.spec.mjs` 另有 2 条替身自检，三视口共 6 项，不算产品功能已实现。合计新增 78，发现清单 1524 项/110 文件、exit0。最终审题另补目录及进度 GET/PUT 的 401 必须触发会话重查并隐藏私人学习，不能只把失效会话当存储暂时错误。

`tests/fixtures/t70-learning-browser.mjs` 仅新增本组协议替身，不改共享 T68/T69 fixture：会话、目录、课程和进度均是 UI 协议数据；媒体复用酒店原 bytes 和真实 Range handler。合成额外第二回合只验证状态索引，不声称原视频含有这段对白。持久化在本组 fixture 中是内存字典，刷新保留是协议边界验证，不能代替第二组真实 SQLite/HTTP 或最终真人重登。

超时用单次安装的 fetch wrapper、统一 `Request` 规范化及导航后显式目标，避免多份 initScript 的未定义顺序。部分 JSON body 在 headers 后保持 pending，客户端须在虚拟浏览器时间推进到 5.1 秒时 abort 并可恢复；这不是现实网络故障计时。自检直接在请求体已提交之后制造不完整响应，必须先确认读取 pending，再明确 abort、signal.aborted、目标计数加一和消费 reject；不把特定错误名当产品合同。

保存替身使用结构等价，不按 JSON 键顺序判冲突。丢 ACK 替身先保存版本，再中断响应；迟到响应题观察具体原 Request 的 finished/failed，再等待两帧，允许实现正确取消请求，不用固定睡眠冒充晚到证明。未知会话仅要求整个私有课程不可见且暂停，不锁定 DOM 是否卸载。实际媒体自然播放、完整 HTTP/SQLite、真人身份绑定/退出重登仍必须另证；T70 保持未勾选。

## 第三组实际红结果

- 最初普通沙箱启动测试服务时监听 3210 得到 EPERM，未运行产品断言，不算产品红。经工具权限批准后，同一运行器实际启动；首轮代表 phone 4 项 exit1：3 项产品红、1 项 T69 既有回归通过，46.8 秒，日志 `.loopwork/logs/t70-stage3-phone-red.log`。产品红为未找到“我的场景”入口（2 题）或未恢复句子页（1 题）。
- 审题补强五语错误、失 ACK 后保留更新位置、同 A session503 后恢复页面/回合、codec 尾差、JSON 读体恢复和竞态屏障，并新增两条永久替身自检。中间代表运行 5 项 exit1：2 产品预期红 + 1 替身自检失败 + 2 通过，26.9 秒，日志 `t70-stage3-reviewed-phone-red.log`；不把替身失败算产品缺口。
- 替身失败原因为自检要求异常名必须为 AbortError。本机固定 Chromium 实际在流中止后的 Response.json 消费返回 TypeError/Failed to fetch；单题诊断记录 abort 计数 1、堆栈在注入器 signal listener，日志 `t70-stage3-injection-diagnosis.log`。最终另用没有 fetch wrapper 的原生 Response/ReadableStream 对照，也得到同一 TypeError。纠正在当前红相位：保持/加强“先 pending、显式 abort、signal.aborted、逐目标计数增加、读取 rejected 且不能 resolved”这一真实合同，保留错误诊断；产品的 5 秒、位置及版本断言未放宽。共享旧考题未改。
- 最终命令 `npm --prefix tests test -- t70-fixture-sanity t70-learning-library.spec.mjs t69-guided-learning.spec.mjs --project=phone --grep 'fixture sanity only|secondary action|watch position restores|generation watch|manual early continue'`，顶层 **exit1，6 项中 3 产品预期红 + 3 通过，47.2 秒**，日志 `.loopwork/logs/t70-stage3-final-phone-red.log`。3 通过分别是 CAS/结构等价替身自检、4 种请求的部分 JSON 消费中止自检、既有 T69 手动继续/历史角色回归；不是 3 项新产品功能已实现。
- 最终实际执行的是新产品 72 项中的 phone 3 项；其余 69 项未跑，替身 6 项中的 phone 2 项已跑、其余 4 项未跑。重复执行不累加。3 产品红还未走到深层恢复、超时、保存或账号断言；不能以此声称所有分支已被逐个实测。旧 1446 项仅重跑上述 1 项，不称 1524 项全绿。
- 新增文件与合同仅在 tests/，app/lib/spec/rules/hooks/.codex 及旧 T68/T69 spec/fixture 无改，diff 检查 exit0。NOW 登记第三组 red，收到实际红回执后才实现“我的场景”和同版位置恢复；不勾 T70，不新增模型请求、费用、配置、密钥、发布或删除。
- 独立只读最终四段审题核实 5/5 设计交付、八项作弊未见命中，复核最终代表日志和原生流错误对照，确认可冻结 red。随后补的 API401 题亦静态通过：错误码与真实协议一致，每种模式均观察触发后的新会话请求完成，再判断隐私隐藏；未实跑该新增题。审查者没有亲跑测试或 verify，不把静态审查当产品验收。盲区为自然播放/后台切换保存、真实媒体与默认接口全链路、真人绑定/重登，留实现后补证。
