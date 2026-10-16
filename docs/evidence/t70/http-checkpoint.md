# T70 · 私有目录与进度 HTTP 实现检查点

核验第二组红回执 `57bbf90c09` 后进入 implementing。本检查点覆盖服务与 HTTP，**不是完整 T70 green**；T70 保持未勾选，界面、真人账号绑定及退出重登仍待后续验证。

## 五项合同与实现

1. `lib/learning-library.ts` 从既有私有 courseStore 实读本人课程及实际媒体，再核验课程、材料版本、媒体和逐句数据，最后读写进度。进度记录不授课程访问权。
2. 目录按最近学习记录读取原材料版本，并核对媒体 SHA；原材料不可读或哈希变化时记为 unavailable，不自动切新版或公用样片。源列表失败及鉴权失败向上传播，不返回假空库。
3. 有 requirement 时使用同版需求快照；缺背景的原生成课或副本提供 `legacy-neutral`、六关键词为空。不能据“缺资料”推断年代或恢复原角色；已有但非法或错版的资料不降级。
4. `app/api/learning-library/route.ts` 提供私有目录 GET；`app/api/scene-progress/route.ts` 提供严格选择器 GET 和同源 PUT。PUT 限定字段、版本与位置类型，流式累计最多 2048 字节；错误只返回通用私有响应。读取/保存开始时复制输入，防止异步期间调用方换值。
5. 默认路由连接本地课程库和 `scene-progress.sqlite`；无密钥或 Vercel 环境返回配置不可用，不退回共享样片。未增加生成执行入口或模型调用。

## 已执行验证

- 首组存储 30 + 本组 47，共 **77/77 通过、失败 0**，最终命令 `npm --prefix tests test -- t70-learning-library t70-learning-http t70-progress-failures t70-scene-progress --project=domain` 顶层 exit0、984ms。日志 `.loopwork/logs/t70-stage2-final-green.log`。已覆盖合法 SQLite 内坏 JSON/非法位置不重置，以及真实 UPDATE 语句被触发器拒绝时保留旧位置、之后可合法保存；不是磁盘满/EIO 测试。
- 最终 `npm run verify:offline` exit0，类型检查与生产构建通过；日志 `.loopwork/logs/t70-stage2-final-offline.log`。未在本中间检查点运行默认完整 verify，不能称发现的 1446 项全部通过。
- `node tmp/t70-stage2-qa/run.cjs` 顶层 exit0。最初普通沙箱监听 3270 得到 EPERM，随后经工具权限批准运行同一脚本；未改配置或测试。独立 Next 3270 使用生产构建和默认路由，结束后关闭自己的服务；用户 3000 服务未动。实际结果见 [HTTP QA 数据](./http-qa.json)，原脚本、服务日志和结果在 `tmp/t70-stage2-qa/`，执行日志 `.loopwork/logs/t70-stage2-real-http.log`。
- 冻结 tests/spec/rules/hooks/.codex 无变，`git diff --check` exit0。源码仅新增服务与两条路由，无旧源码改动。

## 实际网络取证

| 项目 | 实际结果 |
|---|---|
| 私有目录 | 新增合成源账号 1 条同版 requirement 课程；授权目标副本账号 1 条 neutral 课程；无 operational 字段输出 |
| 实际视频 | 复用已有酒店视频 1,475,721 字节，源及副本完整 GET 200、Range 206；均核对 SHA 与原 bytes 相同 |
| 进度持久 | 源 watch/1.25、目标 prompt/2.5 独立保存为版本 1，随后 HTTP GET 一致 |
| CAS | 已收到 ACK 后，以同内容和旧版本重试返回原版本 1；符合失 ACK 后的等价重试语义，但没有实际制造网络丢 ACK。不同位置过时写入 409，旧值保留 |
| 同身份新会话 | 重新签发同一合成身份 Cookie，仍读取原位置；不是实际 Google OAuth 重登 |
| 材料版本 | 源新增材料 4 后，目录仍恢复学习过的 3；显式读取 4 的进度为 null，没有继承 3 的进度 |
| 权限与同源 | 他人课程进度/媒体 404，匿名目录/进度 GET 与 PUT 401，错材料 404，空或外站 Origin 403，127.0.0.1 别名同源 PUT 成功 |
| 调用记录 | 该合成任务 providerCalls=0、reservedMicros=0；脚本没有调用模型执行函数，不是全账户账单或外部网络全量审计。只准备新的合成任务和账号副本，没有覆盖既有账号资料 |

QA 为接口验证而直接准备合成任务状态，**不证明新生成、真人使用或浏览器恢复播放**。读取完整媒体字节不等于本轮已在浏览器播放；已有媒体播放证据属于 T69。

## 独立审查及下一段

独立只读审查核实五项合同实现，未发现阻止 note 的问题，八项作弊检查未见命中。审查者核对专项和离线日志，未亲跑测试或构建；随后只读复核 HTTP 脚本、结果和服务日志，确认请求经过默认 Next 路由，可存有限 note。空 Origin 在实际 HTTP 中覆盖，真正缺失 Origin 由 domain 考题覆盖；不是同一条网络证据。

已知未验：目录串行完整核验媒体，多条/长视频时的耗时尚未测；服务端请求体没有独立时间限额，不能把 2048 字节上限说成时间上限。第三组客户端须包含 JSON 读取在内的 5 秒期限、保存失败明确反馈、读取完成前不写默认值、恢复暂停且不开麦、账号切换隔离迟到响应等考题。

NOW 登记 note 保存本组实现；收到实际回执后再切 test-writing，补“我的场景”及同版位置恢复界面考题。真实目标账号和授权课程复制，仍按 T62A 通过普通登录明确绑定后验证退出重登。无新增费用、密钥/规矩/配置修改、发布、删除、手动 commit 或 stop_hook。
