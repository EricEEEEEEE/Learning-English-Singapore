# T68 · 同版需求的独立生成进度

范围为已批准C2F零新增模型费用批次。实际核验红回执`3db31b975e`后才切implementing；冻结的tests/spec/rules/hooks未改。没有启动worker、配置供应商、改密钥或发布。这里的“生成场景”创建持久任务，默认状态如实显示“需求已保存，尚未开始生成”。

## 5项交付对账

| 项目 | 实现与证据 |
| --- | --- |
| 先存完整需求再显式提交 | 六字段页增加主要动作“生成场景”，保留单独保存；保存失败或冲突不POST。生成准备期间冻结本次输入，单独保存仍允许继续编辑。提交由用户事件发起，effect不自动创建。 |
| 独立进度及恢复 | `?generation=N`先于POST写入本地路由；刷新、直达、重查只GET，回执丢失也只查询原任务。无任务时说明暂未查到，不显示假进度或替换样片。历史页返回保留较新/未保存草稿。 |
| 完整快照绑定与幂等 | 服务端签名cookie确定归属，读取指定历史需求；原描述空格/换行、六字段、语言和版本共同进入命名空间指纹，与旧描述任务隔开。SQLite事务和唯一约束保证并发同版复用；变版不改写旧任务。 |
| 真实阶段与错误边界 | 只显示服务端阶段，读请求5秒期限包括JSON；非终态5秒GET轮询、隐藏暂停。迟到GET/POST有owner、版本及请求身份检查。返回、新提交与旧finally隔离。 |
| 课程可读后才观看 | 服务端实际调用既有私有getCourse，检查材料版本、媒体归属和字节完整性；成功指针原样交既有播放器。模拟/失败/媒体不可用不开放观看、不新建任务或回退旧片。 |

实现文件：`lib/scene-generation.ts`、`lib/generation-tasks.ts`、`lib/local-course-store.ts`、`lib/scene-requirement-content.ts`、`app/api/scene-generation/route.ts`、`app/use-scene-generation.ts`、`app/use-scene-requirements.ts`、`app/scene-generation-copy.ts`、`app/learning-entry.tsx`。沿用本地SQLite和私有媒体库，无新依赖或旧库迁移。

HTTP GET严格单个正整数revision；POST仅收requirementRevision、必需同源Origin，流式体上限1024字节。私有响应no-store，错误不泄露内部路径/身份/预算。默认接口没有供应商执行方法；Vercel或缺失本地配置返回503。

## 验证记录

- 红阶段：新增129项，发现1309项/103文件；实际不同新用例54项中T68的52项预期失败、T67补证2项通过，其余75未跑。完整红证据见`tests/evidence/t68-generation-contract.md`。
- 后端定向45/45通过、exit0：`.loopwork/logs/t68-domain-green.log`。首次类型检查发现既有getCourse返回类型不总有materialsRevision，改为先检查属性存在后比较，未碰考题。
- 手机T67+T68定向47/47通过、exit0，22.6秒：`t68-phone-green.log`。此结果在最后观看生命周期修复之前，不冒充最后版本全量验证。
- 最后实现版本类型检查与生产构建exit0：`t68-pre-qa-build.log`。
- 最后实现版本原默认`bash .loopwork/hooks/verify.sh`顶层exit0，1309/1309通过、失败0，摘要3.7分钟，原300秒内；三视口各208、domain685。包装日志`t68-verify-command.log`，完整日志`verify-20261016-145330.log`，没有临时超时、worker、重试或跳题修改。
- 独立只读判卷员亲自再运行原默认verify，顶层exit0、1309/1309、失败0，223.047秒、原300秒内，三视口各208、domain685。包装`t68-reviewer-verify-command.log`、完整`verify-20261016-145741.log`。自QA及主向导完整验证后仅补文档，源码未变。四段限定判卷通过，见[审查记录](review.md)；绿档仍以Stop回执为准。

## 真实Next HTTP与浏览器补证

Browser插件没有可用headless运行器，沿用本仓库固定Playwright。`node tmp/t68-qa/run.cjs` exit0，独立Next生产服务3268、默认实际路由及本地SQLite，合成签名会话。没有替换用户密钥、修改真实账号记录或干预用户3000服务；脚本结束关闭本次服务。

桌面1440×900、手机320×740，DPR2：描述/六字段/语言真实保存→显式创建→刷新原任务；同版HTTP重试及localhost/127.0.0.1两个Origin均201同ID；改关键词后新版本新ID，历史仍原样。真实POST通过route.fetch落库后只丢ACK，页面GET恢复，刷新不多POST。每账号实际3次浏览器POST、3个不同版本任务，providerCalls与reservedMicros均0。外站/缺Origin403、另一账号GET/POST404、匿名401、重复revision400；横向溢出及pageerror均0、外部请求0。

两独立Node进程在任务尚不存在时并发发起当前service.submit：均返回同一ID，数据库仅1任务，providerCalls0。没有ready/go同步屏障，因此仅证明本次双进程幂等结果，不宣称必然触发SQLite锁争用。子进程凭据经stdin传递，不出现在命令行或输出。

### 已有媒体的准备型QA边界

独立合成“酒店入住”账号先经正常HTTP建立需求任务；随后脚本直接准备该测试任务的video_assembled/script/timeline及材料版本3，私有保存既有酒店视频字节。**这不是一次真实新生成，不证明worker或模型已运行。** 准备记录仅用于验证真实私有读取和页面联通，不能用来宣称任意需求已生成。

实际Next接口读取材料3、媒体全文件SHA匹配，Range206返回32字节；浏览器实际播放currentTime>0.1。同A focus复核及一次session503后恢复同课程/材料3；核验失败时无video。确认B移除旧视频、B媒体404，确认退出回登录。只改合成任务的媒体哈希后真实getCourse失败，页面无观看入口、不使用酒店片作错误回退；随后恢复该QA记录。此段浏览器生成POST0，外部请求0。

审查发现的“每次复核退出观看”已修：最后成功owner与当前可操作enabled分开，同账号不清观看指针；未知鉴权仍不允许新操作，确认换号/退出才清理。**播放器核验时仍卸载，恢复会重新挂载，不保播放时间或学习步骤**；不宣称连续播放/进度保存，后续T69/T70接续。下一红阶段应补这条永久回归，当前有上述真实QA。

结果镜像见`browser-http-qa.json`。临时QA脚本与截图为本地忽略产物，并非已入Git或公开发布；主向导已目视检查3张真实fullPage截图，没有改样式、无溢出/错误遮罩。

| 本地文件 | SHA256 |
| --- | --- |
| tmp/t68-qa/run.cjs | fe90ca878f2485c45f7fc5cfbdcde40c9068a9929aa842c157305ded49ae7cbd |
| tmp/t68-qa/submit.cjs | ca5ac5815cc80c9d9685edd3939711e8fade35e33d0089b56a187ce1126a074d |
| tmp/t68-qa/progress-desktop.png | 8aac34ddf390179800e72e1de0a13c40ec059b986026313de1f40a5db8014245 |
| tmp/t68-qa/progress-phone.png | 0770c402589dc9ae824a5406abff8bda43177ce93328668be56a7d610de802e3 |
| tmp/t68-qa/prepared-private-course-desktop.png | f7c0ca04824005aa387b9637857c3f00f2159dd6f2fdf2ee580a9d0cd211335c |

## 范围限制

本步创建任务、查询和打开已可读课程；六关键词实际驱动新模型脚本仍属T71。新视频、收费worker、5–8分钟、多场景生成、自由语音对练和云课程库均未因本步实现而成立。真人Google OAuth、Safari真机、母语审校、磁盘损坏及真实长时间系统后台未重验；合成visibility/JSON读体测试不等于这些实测。
