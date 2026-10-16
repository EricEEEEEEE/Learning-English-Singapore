# C3 付费实测操作手册（T71D 真实生成 + T63C 真实对练）

只在环境 `openai`（env_01UMzbevMAdmEvkeRK52XHAt，带 `OPENAI_API_KEY` 与 `LTX_API_KEY`）的新会话里执行。本批真实调用总上限 USD30（用户 2026-10-16 批准），不与历史 USD26 合算，不得超额。

## 硬规则

- 密钥只从环境变量读，绝不打印、写入文件、日志、提交或对话。命令里只用 `$OPENAI_API_KEY`，不要 `echo` 它。
- 分配：T71D 生成 ≤ USD20（`LES_LIVE_MAX_MICROS=20000000`），T63C 对练 ≤ USD8（`LES_PRACTICE_MAX_MICROS=8000000`），余 USD2 作误差。两者之和由代码强制 ≤ USD30。
- 失败、未知提交一律不自动重发；执行器停在 `failed`/`unknown`/`budget` 时停下记录，不手工绕过账本。
- 不部署、不发布、不改 main、不强推。只在分支 `codex/ai-handoff-20261016` 上提交证据。
- 身份用本地生成的 `AUTH_SESSION_SECRET` 加 `sealGoogleSession` 合成签名会话（与 T61 证据相同做法），不冒充真实 Google 登录，不把它当作 T70 的人工复核。

## 0. 预检（零费用）

```bash
cd <repo> && git checkout codex/ai-handoff-20261016 && git pull origin codex/ai-handoff-20261016
test -n "$OPENAI_API_KEY" && test -n "$LTX_API_KEY" && echo keys-present
command -v ffmpeg ffprobe || sudo apt-get install -y ffmpeg
curl -sS -o /dev/null -w '%{http_code}\n' https://api.openai.com/v1/models   # 401 即可，说明网络通
curl -sS -o /dev/null -w '%{http_code}\n' https://api.ltx.io/                # 任何 HTTP 码即可
npm ci && (cd tests && npm ci) && npm run build
```

网络不通（代理 403 或连接被拒）时停下，记录被拒主机，告诉用户需要把环境网络设为 Full 或放行这些主机。

## 1. 启动服务（T71D）

```bash
export AUTH_SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export LES_LIVE_GENERATION=1 LES_LIVE_BUDGET_SCOPE=C3-T71-$(date +%Y%m%d) LES_LIVE_MAX_MICROS=20000000 LES_LIVE_PRIOR_SPENT_MICROS=0
export LES_FFMPEG=$(command -v ffmpeg) LES_FFPROBE=$(command -v ffprobe)
export LES_MEDIA_HOSTS=placeholder.invalid   # 先占位，第 2 步查到 LTX 媒体下载主机后改掉再重启
rm -rf tmp/generation-tasks   # 用全新目录，避免旧 live_budget 范围冲突
npm run start -- --hostname 127.0.0.1 --port 3300 &
```

合成会话 cookie：

```bash
node --experimental-strip-types -e "import('./lib/google-auth.ts').then(async m => console.log(m.GOOGLE_SESSION_COOKIE + '=' + await m.sealGoogleSession({provider:'google',issuer:'https://accounts.google.com',providerSubject:'c3-synthetic-learner',email:'synthetic@example.invalid'}, process.env.AUTH_SESSION_SECRET, Date.now())))"
```

所有请求带 `Origin: http://127.0.0.1:3300` 和这个 cookie。

## 2. 生成两节不同场景的短课（约 60 秒默认）

每节：`PUT /api/scene-requirements`（`expectedRevision` 按当前修订号）保存需求，再 `POST /api/scene-generation` `{requirementRevision}` 提交，然后每 15–30 秒 `GET /api/scene-generation?revision=N` 读状态（读状态会自动续跑）。

建议两个场景（与已有酒店样片不同）：
1. 学校接孩子时和班主任聊孩子适应情况（地点：小学教室；你：家长；对方：班主任）。
2. 在小贩中心点餐并问辣度（地点：小贩中心；你：顾客；对方：摊主）。

第一节走到视频阶段时，从服务端日志或任务库里第一次 `queryVideo` 成功的结果找到媒体下载 URL 的主机名，设 `LES_MEDIA_HOSTS=<该主机>`，重启服务；执行器按持久状态续跑，不会重新提交。

任一节停在 `failed`/`unknown`/`budget`/`review_failed`：停止，不重试，记录原因。两节都 `ready` 后，用 ffprobe 检查成片时长、音视频流都在。

## 3. 真实对练（T63C）

保持服务运行，追加 `LES_LIVE_PRACTICE=1 LES_PRACTICE_MAX_MICROS=8000000` 重启。用 `ffmpeg -f lavfi` 或 OpenAI TTS 先合成一段学习者英语回答（如 "Yes, I booked a room." 对应第一回合），转 webm/wav，`POST /api/practice-turn` 发 3–5 轮（含一轮纯静音，应回 `{kind:'silence'}`）。记录每轮转写、回应、是否配音成功。

## 4. 记账与证据

- 账单：生成从 `tmp/generation-tasks` 的账本读预留与实际；对练从 `tmp/practice/practice.sqlite` 的 `practice_turns` 汇总。写成美元，合计必须 ≤ USD30。
- 证据写到 `docs/evidence/t71/c3-live-generation.md` 与 `docs/evidence/t63/c3-live-practice.md`：场景、任务 id、各阶段耗时、成片时长与哈希、每轮对练结果、费用。不贴密钥、cookie、完整媒体 URL 签名。
- 两节都成功：勾 T71D；对练成功：勾 T63C。`progress.py journal` 记一条，提交并 `git push -u origin codex/ai-handoff-20261016`。
- 生成的媒体文件不进 Git（tmp/ 已忽略）。
