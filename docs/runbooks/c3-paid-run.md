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
export NODE_USE_ENV_PROXY=1   # 云端必需：Node 内置 fetch 默认不走 HTTPS_PROXY，不设会让首个请求变成 submission_unknown
export LES_MEDIA_HOSTS=storage.googleapis.com   # 2026-10-17 实测 LTX 成片下载主机
rm -rf tmp/generation-tasks   # 用全新目录，避免旧 live_budget 范围冲突
npm run start -- --hostname 127.0.0.1 --port 3300 &
```

合成会话 cookie：

```bash
node --experimental-strip-types -e "import('./lib/google-auth.ts').then(async m => console.log(m.GOOGLE_SESSION_COOKIE + '=' + await m.sealGoogleSession({provider:'google',issuer:'https://accounts.google.com',providerSubject:'c3-synthetic-learner',email:'synthetic@example.invalid'}, process.env.AUTH_SESSION_SECRET, Date.now())))"
```

所有请求带 `Origin: http://127.0.0.1:3300` 和这个 cookie。

### 1.1 C14 视频模型与出片前质检（2026-10-18 增补）

- 模型白名单：`LES_LTX_MODEL=ltx-2-5-fast`（不设时的默认，每段预留 USD1.90）或 `LES_LTX_MODEL=ltx-2-3-pro`（每段预留 USD1.20）。其他值启动时就被拒绝，服务不会建立付费执行器。请求固定带 `camera_motion: "static"`，提示词为 “steady eye-level shot, single shot”。
- 每段视频在探测和音轨还原之后过本地 ffmpeg 质检：段内切镜为 0、黑帧/冻结不超过 1 秒、段间接缝 SSIM ≥0.6。“单人脸帧占比 ≥0.9”“学员台词时段对方嘴动比 ≤0.35”由 C14-4 脚本 `scripts/video-qa/face_checks.py` 检查（用户 2026-10-18 批准 MediaPipe / PySceneDetect，只在离线脚本里用）：开跑前先 `python3 -m pip install -r scripts/video-qa/requirements.txt`、`python3 -I scripts/video-qa/face_checks.py --fetch-model`（官方模型进 `~/.cache/les-video-qa`，不进仓库）、`python3 -I scripts/video-qa/face_checks.py --probe` 看到 `ready`；Python 路径可用 `LES_PYTHON` 指定（默认 `/usr/bin/python3`）。Python、库或模型不可用、脚本出错或超时时这两项记 `not_checked`。阈值待本轮（C15-4）用真实视频标定。
- C15-4f：第 1 段过闸门后，同一脚本加 `--anchor` 在学员台词时段里挑一帧（恰好一张脸、嘴开合最小且 ≤0.05、睁眼、正脸、脸高占画高 0.10–0.28、清晰度 ≥20，阈值待标定），作为整课固定参考帧，第 2 段起每段都用它作 image_uri；挑不到或脚本出错时退回上一段末帧接续，任务记录 `anchorFrame` 写明原因（驱动脚本的任务摘要也带 `anchorFrame`，选中时另存 `<名字>-anchor.png`）。闸门另有可选检查 `framing_drift`：各段单人脸帧脸高中位数相对第 1 段变化超过 ±35%（待标定）判 quality_failed。注意：固定参考帧之后，接缝 SSIM 比的是上一段末帧和本段首帧（≈参考帧），尚无付费样本，0.3 阈值可能需要重标。
- C15-4g：闸门再加两项可选检查（同一脚本测量，阈值待标定）：`background_noise`（脸框外细小高亮斑点，最忙 1 秒中位数相对第 1 秒增长超过 3 倍判 quality_failed）、`learner_mouth_motion`（学员时段对方唇距与嘴宽的往返变化每秒超过 0.2 判 quality_failed；原 `learner_mouth` 比例检查不变）。组装成片时每个接缝做 3 帧画面交叉淡化（音频、时长、台词时间轴不变）。
- 结果三态：`passed` / `quality_failed` / `needs_review`。有 `not_checked` 时最多 `needs_review`：课程照常可看，生成页写“画面还没经过人脸检查，需要人工看一遍”，必须人工看片，不能当作通过。
- `quality_failed` 的段先过预算守卫再重做一次；仍不过则整课停在 `quality_failed`，不组装、不进“我的场景”。原因和关键帧时间点记在任务的 `videoQuality` / `videoRedos` 里。重做也计入本批上限。
- 预演（`LES_VIDEO_PREVIEW=1`）按预演路径通过质检，并用本地占位图做对方定妆照（第 1 段首帧），真实图像调用为 0；末帧模糊或过暗时退回定妆照。

### 1.2 C15-4 视频小样（2026-10-18 增补）

- C15-4 不走上面的服务和 `tmp/generation-tasks`（那里存着 C3 的预算范围），改用 `scripts/c15/video-sample.mjs`：独立目录 `tmp/c15-4-tasks`、预算范围 `C15-4-20261018`（上限 USD25），每笔付费请求先在 C15 账本预留。
- C15-4g：驱动脚本加 `--max-usd N`（本轮硬上限，≤25）。每个付费请求发出前先计入本轮：LTX 按请求自带音频秒数向上取整 × 单价（读不出按该模型每段最坏价），OpenAI 按预留计、结算后改实付；超过 N 就在本机抛错、不发出。任务摘要的 `runCap` 写本轮累计。产品运行时的预算守卫本来就在提交前按每段最坏预留检查，与此并行。
- 2026-10-23 按真实视频调整（C15-4a–e）：单人脸占比阈值 0.75，两张及以上脸的帧占比 ≤0.1；接缝 SSIM 阈值 0.3；视频偏短时最多补 12 帧；场景课分段边界放在对方台词前；每段提示词只写本段对方台词和静听时段。新课用 `--fresh-scope NAME` 开新的运行时预算范围，旧范围已累计以前各任务的整笔预留。
- LTX 余额不足时可能先回 202，再在任务状态里报 `insufficient_funds_error`。产品端只看得到 `failed`；驱动脚本会识别这个错误并停下整轮。LTX 没有免费的余额查询接口。

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
