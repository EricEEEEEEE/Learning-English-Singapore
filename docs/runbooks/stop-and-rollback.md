# 停止与回退手册（T36 零费用部分，2026-10-17）

本手册只覆盖**本地或单机运行的 Next 服务**。目前没有任何生产托管：没有正式域名，没有云数据库，没有云存储（见文末“不覆盖的范围”）。手册里的每个开关、路径和命令都对照过 `codex/ai-handoff-20261016` 分支 f762fdc 之后的代码；行号写在括号里，以后代码变了要重新核对。

## 0. 先认清：哪些东西会花钱

| 花钱的环节 | 开关（只从服务端环境变量读） | 代码位置 |
| --- | --- | --- |
| 场景生成（脚本 + 配音 + 视频） | `LES_LIVE_GENERATION=1`，同时要 `OPENAI_API_KEY`、`AUTH_SESSION_SECRET`、`LES_LIVE_BUDGET_SCOPE`、`LES_LIVE_MAX_MICROS`、`LES_MEDIA_HOSTS`，非预演时还要 `LTX_API_KEY` | lib/live-scene-runner.ts:18–28 |
| 视频预演（不调 LTX，只花脚本和配音钱） | `LES_VIDEO_PREVIEW=1`（可以不配 `LTX_API_KEY`） | lib/live-scene-runner.ts:23–24, :32 |
| 语音对练（转写 + 回应 + 配音） | `LES_LIVE_PRACTICE=1`，同时要 `OPENAI_API_KEY`、`AUTH_SESSION_SECRET`、`LES_PRACTICE_MAX_MICROS` | lib/live-practice.ts:11–14 |

几条代码事实，决定了下面的操作方式：

- **缺任何一个条件，就不建真实执行器**：`createLiveSceneRunner` / `createLivePracticeService` 返回 `null`。生成接口照常存需求、显示状态，但不会推进；对练接口返回 503 `practice_unavailable`（app/api/practice-turn/route.ts:18）。
- **两个开关都只在进程第一次用到时读一次**，之后缓存在进程里（app/api/scene-generation/route.ts:61–65，app/api/practice-turn/route.ts:47–53）。**改环境变量后必须重启服务才生效。**
- 上限：生成上限 `LES_LIVE_MAX_MICROS` 最多 30,000,000（USD30，lib/live-scene-runner.ts:8, :25）；对练上限加生成上限合计不超过 USD30（lib/live-practice.ts:14）。单位是“微美元”，1,000,000 = USD1。
- 生成上限在第一次真实预留时**写进数据库** `tmp/generation-tasks/generation.sqlite` 的 `reservation_limit` 表，预算范围和既有支出写进 `live_budget` 表（lib/generation-tasks.ts:58–80）。之后环境变量里的上限、范围或既有支出跟库里不一致，就会抛出 “Reservation limit configuration conflict” 或 “Live budget configuration conflict”，提交失败。所以**不能靠调小 `LES_LIVE_MAX_MICROS` 来收紧同一个库的上限**；要停就关开关（见第 1 节）。
- 对练的上限不存库，每次重启按 `LES_PRACTICE_MAX_MICROS` 重新算，已用金额从 `tmp/practice/practice.sqlite` 的 `practice_turns` 表累加（lib/practice-turn.ts:41–47）。
- 设置了 `VERCEL` 环境变量时，这些接口一律返回 503（例如 app/api/scene-generation/route.ts:64），也就是说现有代码本来就不在 Vercel 上跑生成或对练。

## 1. 立即停止花钱

按从快到彻底的顺序。一般做完 1.1 加 1.2 就够了。

### 1.1 停掉服务进程

在跑 `npm run start` 或 `npm run dev` 的终端按 Ctrl+C。如果是后台进程：

```bash
pgrep -af next     # 先看清进程号（next start 运行时进程名可能显示为 next-server），不要误杀别的 node 进程
kill <进程号>
```

进程一停，执行器就不会再发新请求。已经发给供应商的请求怎么处理，见 1.4。

### 1.2 关掉开关后再启动

把 `.env.local`（或启动时 export 的变量）里的这几行删掉，或者改成 `0`：

```bash
LES_LIVE_GENERATION=0
LES_LIVE_PRACTICE=0
```

代码只认字符串 `'1'`（lib/live-scene-runner.ts:19，lib/live-practice.ts:12），所以 `0`、空值和不设效果一样。然后重新启动：

```bash
npm run build && npm run start      # 或开发时 npm run dev
```

检查确实关掉了（零费用，不会触发生成）：

```bash
# 对练：开关关闭时，同源 POST 应该得到 503 practice_unavailable
curl -sS -X POST -H 'Origin: http://127.0.0.1:3000' -H 'content-type: application/json' \
  --data '{}' http://127.0.0.1:3000/api/practice-turn
```

生成这边没有不登录就能查的接口。可以登录后打开一个处于进行中的任务：状态页只显示已存状态，不会再往下走。读状态时只有执行器存在才会续跑（app/api/scene-generation/route.ts:15–19）。

### 1.3 更彻底：把密钥从本机拿掉

- 从 `.env.local` 删掉 `OPENAI_API_KEY` 和 `LTX_API_KEY` 两行（`.env.*` 已在 .gitignore 里，不会进 Git）。没有密钥，两个执行器都建不起来。
- 最彻底的是到供应商控制台**作废这两把密钥**，这一步只有负责人能做。作废后，哪怕别处还留着旧副本也用不了。
- OpenAI 组织设置里有 “Enforce a hard limit”，目前是关的（BLOCKED.md 顶部 2026-09-28 记录）。要不要打开、设多少，由负责人决定。不要改整个组织的设置去影响别的项目。

### 1.4 停下以后要知道的事

- 已经提交给 LTX 的视频任务，本产品**没有取消接口**（lib/ 里没有 cancel 相关代码），供应商那边会继续渲染并计费（推断）。账本里已经按上限预留，不会少记。
- 停的时候正在提交、结果不明的任务，下次启动时停在 `submission_unknown`，**不会自动重发**（tests/domain/t71b-generation-runner.spec.mjs:84）。页面显示“提交结果尚未确认，不会自动重新提交”。
- 已经预留的金额删不掉：删场景只留“墓碑”，预留金额照记（tests/domain/c5-data-store.spec.mjs:43）。这是故意的，用来守住总上限。
- 换掉 `AUTH_SESSION_SECRET` 会让所有人的登录 Cookie 失效（都要重新登录），但**不会丢数据**：本人数据按 Google issuer+subject 的哈希归属，和这把密钥无关（lib/private-owner.ts:26–29）。这一招可以用来立刻踢掉所有已登录会话。

## 2. 回退到之前的绿存档

只在本分支 `codex/ai-handoff-20261016` 上操作。**不碰 main，不强推，不改写已推送的历史。**

### 2.1 找绿存档

```bash
git log --oneline --grep="绿" | head -20
```

每批的绿存档提交写着“存档: … 绿（…）”，紧跟一条“登记: … 绿存档”。截至本手册：

| 批次 | 绿存档 | 登记 |
| --- | --- | --- |
| C7 内容和多语言 | ab81b68 | f762fdc |
| C6 对练质量 | 30554e2 | b70ba72 |
| C5 数据和信任 | bb00cd6 | 8b6787d |
| C4 复听和帮助 | bae0b1c | 67ad05d |

对应的完整验证结果写在 tasks.md 各批的“**绿**”段落里。

### 2.2 先在旁边看一眼（不改分支）

```bash
git worktree add ../les-rollback-check <绿存档哈希>
cd ../les-rollback-check && npm ci && npm run build
```

确认这个版本就是想要的样子，再做 2.3。看完删掉：`git worktree remove ../les-rollback-check`。

### 2.3 正式回退：用 revert，不用 reset

```bash
git status --short                       # 必须是干净的
git revert --no-edit <要保留的绿存档>..HEAD   # 撤销这个绿存档之后的所有提交，每个生成一个新的反向提交
npm ci && npm run build
LOOPWORK_VERIFY_TIMEOUT=1500 bash .loopwork/hooks/verify.sh   # 完整验证，exit 0 才算回退成功
git push origin codex/ai-handoff-20261016  # 普通推送，不加 --force
```

`<要保留的绿存档>..HEAD` 不包含绿存档本身，只撤销它之后的提交。如果中间有合并提交，revert 会要求 `-m`，这时先停下来问。

云端会话跑完整验证前，按 CLAUDE.md 先执行 `eval "$(bash scripts/cloud-test-browser.sh)"`，否则 78 项视频用例会因为浏览器不支持 H.264 而失败。

### 2.4 回退代码前先备份数据

数据表都用 `CREATE TABLE IF NOT EXISTS` 建，没有版本迁移。旧代码遇到新代码写入的字段，可能读不了，也可能拒绝（例如 T70 的课程进度会拒绝坏行）。所以**回退代码前，先按第 3 节备份 tmp/**。回退后如果旧版本读不了数据，就停服务，把数据换回回退前的备份，再决定怎么办。不要手工改库。

## 3. 本地私有数据的备份与恢复

### 3.1 数据在哪里

全部在仓库下的 `tmp/`（已被 .gitignore 忽略，**不在 Git 里，回退代码不会动它，丢了也找不回**）：

| 目录 | 文件 | 内容 |
| --- | --- | --- |
| tmp/generation-tasks/ | generation.sqlite | 生成任务、学习材料、预算账本（reservation_limit、live_budget） |
| | course-copies.sqlite | 本人课程副本（T62A） |
| | scene-progress.sqlite | 学习位置 |
| | sentence-reports.sqlite | 句子报错 |
| | practice-feedback.sqlite | “这条反馈不对”标记 |
| | deletion-events.sqlite | 删除记录 |
| | media/<owner 哈希>/ | 私有媒体：`<sha256>.bin` 和它的 `.json` 清单（lib/private-media-store.ts:20–22, :36–37） |
| tmp/scene-requirements/ | requirements.sqlite | 场景描述和六项背景 |
| tmp/practice/ | practice.sqlite | 对练费用账本 practice_turns |

有的 sqlite 文件要等对应功能第一次用到才会出现，少几个是正常的。路径来源：app/api/*/route.ts 里的 `join(process.cwd(), 'tmp', …)`，文件名来源：lib/*.ts 里的 `.sqlite`。

另外，`.env.local` 里的密钥和预算配置**不要**和数据放进同一个备份包。数据本身不靠 `AUTH_SESSION_SECRET` 解密（见 1.4），但恢复后要用**原来的** `LES_LIVE_BUDGET_SCOPE`、`LES_LIVE_MAX_MICROS`、`LES_LIVE_PRIOR_SPENT_MICROS`，否则生成会报配置冲突（见第 0 节）。把这三个值记在别处即可，不要记密钥。

### 3.2 备份

```bash
# 1) 先停服务（见 1.1）。所有库用的都是 SQLite 默认回滚日志模式（代码里没有设 WAL），
#    停服务后没有 -journal 文件，直接拷贝文件就是一致的。
pgrep -af next && echo "可能还有服务在跑，确认后先停掉"
ls tmp/*/*-journal 2>/dev/null && echo "有未完成的事务日志，不要备份，先查原因"

# 2) 打包，保留权限（目录是 0700，库文件是 0600）
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/les-backups && chmod 700 ~/les-backups
tar -C . -czpf ~/les-backups/les-data-$STAMP.tgz tmp/generation-tasks tmp/scene-requirements tmp/practice
chmod 600 ~/les-backups/les-data-$STAMP.tgz

# 3) 检查
tar -tzf ~/les-backups/les-data-$STAMP.tgz | head
sha256sum ~/les-backups/les-data-$STAMP.tgz > ~/les-backups/les-data-$STAMP.tgz.sha256
```

备份包里有用户的场景描述和私有媒体。放在本机仓库外的私人目录，**不要提交到 Git，不要上传到聊天或共享盘**。

### 3.3 恢复

```bash
# 1) 停服务
# 2) 现有数据先挪开，不要直接删
mv tmp/generation-tasks tmp/generation-tasks.before-restore-$(date +%Y%m%d-%H%M%S) 2>/dev/null
mv tmp/scene-requirements tmp/scene-requirements.before-restore-$(date +%Y%m%d-%H%M%S) 2>/dev/null
mv tmp/practice tmp/practice.before-restore-$(date +%Y%m%d-%H%M%S) 2>/dev/null
# 3) 校验后解包
sha256sum -c ~/les-backups/les-data-<时间戳>.tgz.sha256
tar -C . -xzpf ~/les-backups/les-data-<时间戳>.tgz
# 4) 用原来的预算配置启动（见 3.1），登录后打开“我的场景”确认课程和位置都在
```

媒体读取时会核对大小和 sha256，不一致就拒绝播放（lib/private-media-store.ts:36–37），所以文件损坏不会被当成正常课程放出来。

### 3.4 千万别做

- 不要 `rm -rf tmp/generation-tasks` 来“重置预算”。C3 付费手册（docs/runbooks/c3-paid-run.md 第 1 节）在一个全新的云端环境里这么做过，但在有真实数据的机器上，这会同时删掉所有课程、媒体和费用账本，而且找不回来。要换预算范围，先备份，再和负责人确认。
- 不要手工改 sqlite 里的金额或状态。账本只增不减，删场景也保留预留金额，这是守住上限的前提。

## 4. 不覆盖的范围

- **没有生产托管**：没有正式部署，没有正式域名，没有云数据库，没有云存储（T62、T36 未做）。此前的 Vercel Preview 只用于 Google 测试登录（BLOCKED.md B02 A3），而且代码在 Vercel 上会关掉生成、对练和私有课程接口。所以“下线网站”“回滚部署”“切流量”“恢复云备份”都不适用。等有了部署方案，再另写。
- **供应商侧**：已提交的 LTX 任务、OpenAI 和 LTX 的日志保留和账单，本产品管不到。作废密钥、设置硬上限、核对账单都要负责人在控制台做。
- **用户浏览器里的数据**：语言、字幕和纠正偏好存在用户浏览器的 localStorage，不在备份范围内，丢了只是回到默认值。
- **Google OAuth 配置**：客户端和回调地址在 Google Cloud 控制台，不在本手册范围。还有一个没用的旧 secret 待停用，属于负责人的安全操作（BLOCKED.md B02）。
- 本手册没有实际演练过一次完整的“停止 → 备份 → 回退 → 恢复”。命令都对照代码和 Git 核对过，但第一次实际使用时，请先在 2.2 的旁路副本里试。
