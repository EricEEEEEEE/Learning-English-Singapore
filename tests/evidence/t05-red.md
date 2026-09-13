# T05 红阶段证据

基线：T04真实绿档 `40e374e438995e1b13b28931c6b041afdf799237`；round_count=4，phase=test-writing。T01–T04共4项已存档，T05尚未实现。

## N 对 M

最终 `npm --prefix tests run list` exit 0，收集 **233** 项（10文件）：原167＋T05 scenario domain15＋profile domain回归3＋browser48（16条×3窗口）。

- scenario domain先跑13项，再跑独立审题后新增2项：两次均exit 1，全部15个唯一考题因缺少 `lib/scenario.ts` 而红。内部行为断言尚未运行，不能把模块缺失说成每项断言都已验证。
- 中文phone起点及非默认候选各1项：均exit 1，缺少“选择要练的事”入口；后续确认、准备、列表内容等断言尚未执行。起点失败截图和上下文保存在`t05-ui-red.png`及`t05-ui-red-context.md`。
- 累计支撑/首次快照回归：3/3、exit 0，分别覆盖答题后帮助、答题前帮助、首次播放晚于作答。
- 真实Tab遍历后Enter/Space设置回归：3/3、exit 0，覆盖320、390、1280宽度；未以直接focus代替Tab。
- 新增48个浏览器实例中已执行上述2个红探针和3个Tab绿回归，剩余43个仅已收集，红阶段未跑。
- 原167项由T04真实绿存档的Stop全绿回执证明；本轮未改实现、旧考题、spec/rules/hooks/验证配置，未重复跑旧167。

完整命令和退出码见`t05-probes.json`；6份日志与最终收集日志已复制到本目录，4份测试/合同SHA-256见`t05-test-hashes.json`。

## 独立审题与边界

只读判卷员t01_review允许封存红考题，无剩余静态阻断，见`t05-review.md`。本轮补齐从旧版本分支的全局编号、历史取消版本不复活，以及实际点击非默认候选后比较步骤/提示列表内容；相关红探针重新执行，未提前写实现。

已知盲区：非中文部分失败/重试、历史分支尚未完整走浏览器路径；新场景大字布局待实现后补查。离线流程通过也不代表真实任意任务生成、语音输入、媒体、母语审查或真人实验通过。

本轮仅改tests/、tasks.md、JOURNAL.md、state.json。红档登记后正常收尾，等待真实Stop回执再进implementing；不开batch flag，不直接git commit，不手动调用Stop hook。T04 result.json的绿回执字段按红阶段文件边界延后随T05实现补入。B1 Goal持续有效，随后继续T05实现与T06。
