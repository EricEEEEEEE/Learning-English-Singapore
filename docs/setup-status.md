# 第一批启动记录

日期：2026-09-11。用户通过引用明确批准：“同意初始化项目及上述项目级配置，按计划开始第一批”。授权已生效，无需重复批准。

## 已执行

- 阅读并审查当前Loopwork安装脚本，确认会写哪些项目配置。
- 建立`.gitignore`，原始research、output、outputs、tmp、密钥及运行日志不纳入首次提交；原文件全部保留。
- 建立PROJECT.md，保存项目范围与本次批准。
- 初始化Git、`.loopwork`、`.codex/hooks.json`、项目安全规则、只读评审配置、AGENTS.md、JOURNAL.md及BLOCKED.md。
- 首次提交：`beb3cec`，主题“存档: Loopwork 项目初始化”；已用git log核验。
- 环境：Node v24.15.0，Python 3.9.6，Git 2.50.1；后续Python媒体依赖版本仍在T06核定，当前版本不等于兼容性已通过。
- 上游selftest.sh在macOS系统Bash下两处变量紧邻中文标点导致unbound variable。仅在项目副本`.loopwork/hooks/selftest.sh`加`${...}`边界，共2处；没有改全局skill或改变检查条件。
- 原自检失败退出1；项目副本外层自检退出0，7项通过、2项警告。日志位于`.loopwork/logs/setup-selftest-external.log`。

## 自检能证明什么

外层探针验证工作区可写、工作区外及.git受沙箱限制、普通外层进程可写临时.git；CLI报告hooks特性启用。警告为未设置新的可选skills路径，以及具名Permission Profile探针退出134；没有因此改全局配置或放宽权限。

这些探针不是当前桌面会话的hooks联测。安装后本会话尚未看到自动SessionStart进度卡、PostToolUse审计或Stop代存档回执，因此hooks状态为“文件已安装，实际加载未验证”，不采用脚本汇总中的full字样作为放行证据。

## 待接续

在本项目重新进入Codex会话，使项目配置重新加载；若客户端要求信任项目，由用户确认。下一轮先检查自动进度卡、待存档回执和真实审计，再恢复第一批。手动运行progress.py card只能验证脚本，不证明SessionStart自动触发。

当前停在启动检查；T01–T06均未勾选，未写应用实现，未调用图像／语音／视频模型，未发布网页。若接通成功，先完成T01行为测试的红存档，再实现可点击页面；依当前skill以真实代存档回执推进。

历史`docs/planning-qa.json`是初始化前的规划快照，不能当当前Git/hooks状态报告。spec.md内容及其既有hash保持不变。

## 2026-09-12：接续诊断修正

用户已发送“继续第一批”。只读检查确认：项目trust_level为trusted，hooks特性为true，但没有本项目四条hook的独立信任记录；初始化note仍待提交，HEAD仍为beb3cec，未产生自动audit.jsonl。不能把上一轮的“重开会话”当成充分恢复条件。

官方文档说明：非受管hook需审阅并信任当前定义，信任按hash记录；新定义在审阅前跳过。入口为CLI `/hooks`。[官方说明](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)

接续步骤：在终端运行 `codex -C "/Users/eric/projects/Learning English  Singapore"`，进入CLI后输入 `/hooks`，只审阅来自本项目`.codex/hooks.json`的四项：

| 事件 | 已安装命令 | 用途 |
| --- | --- | --- |
| PreToolUse | `python3 .loopwork/hooks/guard_pre.py` | 执行前检查 |
| SessionStart | `python3 .loopwork/hooks/progress.py card` | 进度卡 |
| Stop | `python3 .loopwork/hooks/stop_hook.py` | 检查及代存档 |
| PostToolUse | `python3 .loopwork/hooks/audit_log.py` | 审计日志 |

确认这些定义后返回当前任务继续；不在CLI另发开发任务，避免两个会话同时改文件。当前电脑操作工具禁止访问Codex应用，故无法代为点选。没有修改全局信任hash、关闭检查或使用绕过参数。

本轮仅完成启动诊断与接续文档；T01–T06仍0/6，note待存档，未声称自动保护或功能通过。

## 2026-09-12：终端授权后的实际处理

用户授权直接操作终端。已通过官方Codex CLI `/hooks`信任本项目四项当前定义，界面显示PreToolUse、PostToolUse、SessionStart、Stop各1项Active，0项待审阅；只读核对持久化trusted_hash记录存在。没有直接写入信任hash或使用绕过参数。

CLI同时报告项目只读评审角色缺少developer_instructions，已在项目角色配置补齐；重启后该错误消失。诊断CLI已正常退出，没有另发开发任务，避免并行修改项目。

设置已完成；生命周期验收尚未完成：没有把手动进度卡、设置界面Active状态或CLI退出当作Stop代存档证据。当前初始化note仍待真实轮末钩子落档，收到回执后才能登记T01红考题。此处是技能的存档顺序要求，不是再次请求用户批准。
