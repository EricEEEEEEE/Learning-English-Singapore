# Loopwork 工作流交接参考

`loopwork/` 是2026-10-16本机已使用的完整skill快照，来源为用户指定的 `EricEEEEEEE/loopwork-skill-codex` 对应本地安装。源文件清单、相对来源、字节数及SHA256见 [manifest](../handoff/manifest.json)。复制供新AI读取，没有修改全局skill或启用新配置。

- 入口：[SKILL.md](loopwork/SKILL.md)。Stage4：[循环执行](loopwork/references/stage-4-loop.md)，[判卷](loopwork/references/reviewer.md)，[续接](loopwork/references/loop-mode.md)。其他阶段、模板脚本和agent元数据亦完整保留。
- 本项目实际运行版本是仓库根 `.loopwork/hooks/`；Codex接线是 `.codex/hooks.json`。快照 `loopwork/scripts/` 仅为原始参考，不覆盖实际运行文件。
- 其他AI平台不会自动执行Codex钩子。接手者先读 [项目交接](../../HANDOFF.md)，核验本平台能力、实际存档和权限；不能虚构钩子已生效，也不能通过手动调用Stop脚本绕过当前项目约定。
- 项目AGENTS/spec/rules仍以根目录原文件为准；此快照没有更改规则或授予新的付费、发布、密钥权限。
