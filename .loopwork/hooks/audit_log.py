#!/usr/bin/env python3
"""围栏 · 审计账本（PostToolUse：只记录，不拦截——拦截是 PreToolUse 和 Stop 钩子的事）。
每次工具调用追加一行 JSONL 到 .loopwork/logs/audit.jsonl：谁、什么时候、动了什么。
出事之后要能倒查「这一步到底是怎么发生的」，靠的就是这本账。
顺手覆写钩子活体心跳 .loopwork/logs/hook_heartbeat.json：接线在盘上不等于平台在调用它
（settings 没生效 / 会话根不是项目根都会让围栏静默失效），进度卡与轮末钩子靠这个文件把静默暴露出来。
fail-open：本身出错绝不挡路。"""
import datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import guard_log    # 共享库：项目根解析 find_root（不在也不影响记账/放行）
except Exception:
    guard_log = None

def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    try:
        start = payload.get("cwd") or os.getcwd()
        root = (guard_log.find_root(start, script=__file__) if guard_log is not None
                else os.environ.get("CLAUDE_PROJECT_DIR") or start)
        if not os.path.isdir(os.path.join(root, ".loopwork")):
            return 0
        logdir = os.path.join(root, ".loopwork", "logs")
        os.makedirs(logdir, exist_ok=True)
        ti = payload.get("tool_input") or {}
        # CC 各工具的落点字段名不同：Bash 是 command，编辑类是 file_path，
        # NotebookEdit 是 notebook_path，检索类是 pattern——挨个兜住。
        summary = (ti.get("command") or ti.get("file_path") or ti.get("notebook_path")
                   or ti.get("path") or ti.get("pattern") or "")
        rec = {
            "ts": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "tool": payload.get("tool_name", "?"),
            "summary": str(summary)[:200],
        }
        path = os.path.join(logdir, "audit.jsonl")
        # 单代轮转：超 5MB 把老账本顶成 .1（审计要能追溯，但不能无限吃盘）
        try:
            if os.path.getsize(path) > 5 * 1024 * 1024:
                os.replace(path, path + ".1")
        except OSError:
            pass
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        if guard_log is not None:   # 钩子活体心跳：只有 PostToolUse 写它（别的事件写了会把「PostToolUse 死了」盖住）
            guard_log.beat(root, event=payload.get("hook_event_name", "PostToolUse"),
                           session_id=payload.get("session_id", ""), tool=rec["tool"])
        return 0
    except Exception:
        return 0

if __name__ == "__main__":
    sys.exit(main())
