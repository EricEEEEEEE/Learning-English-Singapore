# Claude Code 接手说明

本项目由 Loopwork 管理。先读 [AGENTS.md](AGENTS.md) 与 [HANDOFF.md](HANDOFF.md)，再跑 `python3 .loopwork/hooks/progress.py card`。

## 与 Codex 版的区别（2026-10-16 起）

- 围栏已接到 `.claude/settings.json`（Claude Code 版 guard_edits / guard_bash / guard_ask / stop_batch）。`.codex/` 接线原样保留，Codex 仍可用。
- Claude Code 能直接写 `.git`：存档由向导自己 `git commit`，再 `progress.py set last_round_commit $(git rev-parse HEAD)`；不使用 `progress.py commit` 的代存档登记。
- 绿存档前必须有比实现改动更新、末尾带 `[verify] ✅ 全绿 (exit 0)` 的 verify 日志（guard_bash 的 verify-stale 闸）。

## 云端运行注意

- 云端自带的旧 Chromium 不支持 H.264，视频用例（T59/T60/T61B/T69/T70 共 78 项）会失败。判卷前先运行 `eval "$(bash scripts/cloud-test-browser.sh)"`，它从 storage.googleapis.com 下载与 Playwright 版本对应的 Chrome for Testing 并设好 `PLAYWRIGHT_BROWSERS_PATH`。不能把这 78 项当通过。
- 云端完整 verify 约 14 分钟，超过 verify.sh 默认 300 秒，需设 `LOOPWORK_VERIFY_TIMEOUT=1500`。
