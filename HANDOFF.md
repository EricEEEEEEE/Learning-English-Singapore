# AI 接手入口 · Learning English Singapore

交接日期：2026-10-16。用户本轮要求停止继续登录验收，把项目、文档与工作流同步 GitHub，交给另一个 AI。**下一位先读本文件，不要默认重新催用户登录，也不要自动执行付费生成。**

## 从哪里接手

- 仓库：<https://github.com/EricEEEEEEE/Learning-English-Singapore>，公开仓库。
- 完整交接分支：`codex/ai-handoff-20261016`。不要只 clone 默认 main 后误以为缺少后续成果。
- 本地已核验技术基线：`22f38f31724d06931f845ea2ce1f6404a3e3253a`，T70 界面技术 note，**不是 T70 green**。本交接文档将由 Stop 钩子另落 note，再推送同一分支；最终以远端分支实际 HEAD 为准。
- 远端 main 在公共基线 `5490bde` 后有 `cc65c78` 和合并提交 `a56311c`，把 Next 从16.3.5升至16.4.2。本地另有295次存档，双方已分叉。交接分支保留完整本地历史，不强推 main、不撤销远端升级。接手后如需合并 main，应保留该依赖升级并重新验证；本轮未替用户实施依赖升级或部署。

```sh
git clone --branch codex/ai-handoff-20261016 https://github.com/EricEEEEEEE/Learning-English-Singapore.git
cd Learning-English-Singapore
python3 .loopwork/hooks/progress.py card
git status --short --branch
```

同一台电脑上的原工作区为 `/Users/eric/projects/Learning English  Singapore`。不要把该绝对路径当成其他机器的目录。

## 先读的项目文件

1. [AGENTS.md](AGENTS.md)：本项目工作约定；不要擅改。
2. [当前产品主线](docs/current-product-baseline.md)、[spec.md](spec.md) 的 v0.5 K1–K7：最新产品方向。
3. [plan.md](plan.md)、[tasks.md](tasks.md) 顶部 C2F：批准范围与实际任务状态。
4. [T70技术检查点](docs/evidence/t70/ui-checkpoint.md)、[实际QA](docs/evidence/t70/ui-qa.json)：最近实现、验证与未验证边界。
5. [BLOCKED.md](BLOCKED.md)、[JOURNAL.md](JOURNAL.md) 最后记录：依赖与存档沿革。旧记录保留历史，不是新授权。
6. [Loopwork工作流说明](docs/workflow/README.md) 及完整参考快照。

文档冲突时，最新 K1–K7、当前批准批次、真实代码和存档证据优先。早期问卷主线、占位演示与9月研究报告不能覆盖最新方向；不得改历史报告来制造一致。

## 用户要的产品

帮助所有来到新加坡的成人融入当地生活，尤其包含近零基础、怕开口的人。听力第一、口语第二，不训练读写。尊重新加坡英语口音和方言；产品文案不使用用户反对的称呼。

主路径：微信或Google登录 → 一个输入框描述生活场景 → 六项可选背景关键词 → 按真实任务状态生成 → 观看微剧式视频（首播仅英文字幕）→ 代入角色 → 本片词组、双语句子、字幕接话 → 后续真实语音对练。课程可保存反复学习；重播复用同版媒体，不重新调用视频生成。自由对话仍可能产生API费用，存储与流量也不是零成本。

场景不限家长会、party、酒店；例子可编辑。登录后不再重复展示登录菜单，不把能力问卷变成主线前置。

## 当前真实状态

| 项目 | 已有证据 | 仍缺什么 |
|---|---|---|
| T65–T69 | 简洁登录分流、五语场景输入、六关键词本机保存、同版任务状态、独立观看与逐步角色学习，均有真实green回执 | 不等于任意输入已自动生成新视频 |
| T70 | 本人课程库、本机 page/time/turn 持久保存、同版材料/SHA与账号隔离、暂停恢复；实际默认HTTP/SQLite和已有真实视频已验证 | 真实Google目标副本归属、真正退出重登；仍未勾选 |
| T62A | 双身份授权复制、本地副本库、私有读取与隔离代码已有，本机Google配置此前获批准并已完成 | 目标真人账号尚未最终绑定、原聚会课尚未导入本人账号；用户已要求本轮不再处理登录 |
| 已生成素材 | 仓库有12秒酒店视频与课程；本机另有34.017秒两段聚会课程、材料与私有库 | 34秒不是5–8分钟；本地私有聚会媒体/数据库未公开上传 |
| T61B | OpenAI脚本/TTS、LTX视频、本地FFmpeg处理、私有保存及课程读取有真实短课证据 | 不是新需求提交后全自动生成；旧供应商账单仍须对账 |
| T71 / T63 / T62 / T64 | 分别是关键词驱动自动新课、自由语音、云库、5–8分钟验收候选 | 未获本轮新增实施/收费/部署授权，不冒称已完成 |
| 微信 | 入口保留且如实标尚未接入 | 用户没有所需开放平台权限 |

本地状态 Stage4、cycle2、round8，任务28/68。不要因1524项测试通过而勾选真人验收项。`state.json` 中历史字段可能仍指旧批次，须结合最新 tasks、真实存档和本说明判断；只通过 progress.py 更新状态。

## 验证证据

- 本地基线的最后两次原默认完整验证均 **1524/1524，exit0**；独立复验266.791秒，原300秒上限内。三视口各254项、domain762项。
- [主向导完整日志](docs/evidence/t70/full-verify-main.log)、[独立复验日志](docs/evidence/t70/full-verify-reviewer.log)。这些是旧基线的实测，不是另一台机器或未来合并版本已通过。
- 实际QA：1440×900与320×740、DPR2，默认Next HTTP/SQLite、合成签名身份及既有视频。自然播完酒店、34秒课恢复20.25秒暂停、返回等待末次保存回执、409/503/404保护均有记录；[脚本](docs/evidence/t70/browser-http-qa.cjs)、[结果](docs/evidence/t70/ui-qa.json)、[截图](docs/evidence/t70/desktop-library.png)。
- QA的32次浏览器写入全为进度PUT，准备任务模型调用/预留0，未开麦；Console有3条主动故障错误。合成新Cookie恢复不等于真人Google退出重登。
- 直接关闭网页前未确认的末次进度、50课性能、Safari真机、真实语音与长片未验证。相关永久回归须在下一合法红阶段补，本轮没改考题。

## 本地运行与主要代码

已测 Node24.15.0、npm11.12.1；不要随手更新依赖替代 lockfile。

```sh
npm ci --ignore-scripts --cache ./tmp/npm-cache
npm --prefix tests ci --ignore-scripts --cache ./tmp/npm-cache
./tests/node_modules/.bin/playwright install chromium
bash .loopwork/hooks/verify.sh
npm run dev
```

普通本地入口为 `http://localhost:3000/`，历史演示为 `/demo`。未配置Google时不能假称真实登录可用；离线考题不需要真实API key。真实Google配置字段只有名称供查阅：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`AUTH_SESSION_SECRET`、`APP_ORIGIN`，值不在Git。不要把localhost与127.0.0.1的OAuth会话混用，不复用过期Google授权URL。

- 入口与学习：`app/learning-entry.tsx`、`real-scene-course.tsx`、`use-learning-library.ts`、`use-scene-progress.ts`、`learning-request.ts`。
- 需求、任务、库与位置：`lib/scene-requirements.ts`、`scene-generation.ts`、`generation-tasks.ts`、`local-course-store.ts`、`local-course-copy.ts`、`local-course-library.ts`、`learning-library.ts`、`scene-progress.ts`。
- 默认HTTP：`app/api/scene-requirements/`、`scene-generation/`、`learning-library/`、`scene-progress/`、`generated-course-media/`。
- 登录：`lib/google-auth.ts` 及 `app/api/auth/`。真实执行器：`lib/live-generation-runtime.ts`，须显式配置和费用条件，不从网页自动调用。
- 本机默认私有数据在忽略的 `tmp/generation-tasks/`；聚会素材/账本在忽略的 `outputs/t61-party-multi/`。同机接手先安全检查存在性；换机另做私有数据迁移，不能公开这些数据库/会话或猜owner。仓库内QA脚本依赖该既有聚会媒体，单纯clone不能直接复现全部私人课程QA。

## 工作流、授权与交接范围

当前产品开发批次仅C2F T65–T70、零新增模型费用。历史USD26是此前实验总额与容差，不是接手AI可重花的预算。当前授权是上传GitHub交接，不含依赖升级、生产部署、密钥轮换、新模型调用或商业化。

沿用项目先红后绿；实现阶段不能改tests/spec/rules。只登记 `progress.py commit red|green|note`，由实际Stop钩子落档；不得手动调用stop_hook.py或假造回执。新AI若没有该平台的钩子能力，先说明实际缺口，不把Codex接线复制到别的平台后假称已经生效。参考快照不自动修改任何规则。

已纳入：全部已追踪代码/考题/规格/计划/任务/日志、原调研成稿/来源索引/五份PDF、完整Loopwork参考快照、可公开的最新验证证据。逐文件来源与SHA见[交接清单](docs/handoff/manifest.json)。

不纳入公开Git：密钥、`.env*`、浏览器会话、私人SQLite与生成账本、原始OAuth截图、私有媒体、网页抓取缓存、依赖与构建缓存。它们仍在原工作站，不代表删除；跨机器接手须单独安全迁移。

## 给下一位AI的起始消息

> 请先读HANDOFF.md、AGENTS.md、最新spec K1–K7、plan/tasks顶部C2F、BLOCKED与T70技术证据；核验当前Git分支和实际存档。用户目前只授权GitHub交接，暂不继续登录验收。T70只有技术note，不能勾green。先向用户简述当前事实并确认接下来做什么；不要重建旧问卷主线，不猜目标owner，不调用付费模型，不覆盖远端main的Next16.4.2升级。
