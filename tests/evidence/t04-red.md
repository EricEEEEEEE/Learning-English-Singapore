# T04 红阶段证据

基线：T03真实绿档 `2a1749086d613d96fc0f5b37d1760c64b270e83e`；round_count=3，phase=test-writing。T01–T03共3项已存档，T04未实现。

## N 对 M

最终收集 **167** 项，命令`npm --prefix tests run list`，exit 0。组成：原102＋T04 domain29＋T04 browser36（12条×3窗口）。

- 初次 domain27项：exit 1，27 failed，均缺`lib/placement.ts`；未写实现。
- 独立审题后新增2条并加强5条，复跑7项：exit 1，7 failed，仍缺模块。两轮合计覆盖全部29个唯一domain考题；不能将module缺失误述成每个内部断言已经运行。
- 中文phone档案UI：初次及加强动作断言后各运行1项，均exit 1；缺少“学习起点与帮助”region。最终失败截图`t04-ui-red.png`和context已保留。首轮共享输出截图曾被后续回归运行清理，日志保留；最终重新运行后立即复制证据。
- T03损坏存档回归：3种×3窗口，**9/9通过**，exit 0。证明现有修复在重新预览、选择、暂停、恢复及刷新后保留旧bytes。
- 其余26个T04浏览器执行实例仅已收集，本红阶段未跑，不宣称通过。
- 原102项由刚收到的T03绿存档Stop全绿回执证明；本红阶段没有改实现、旧考题、spec/rules/hooks，未重复跑旧102。

完整命令与退出码见`t04-probes.json`，同目录保留对应日志；最后收集日志`t04-test-list.log`。

## 闸门

只读独立审题已通过，见`t04-review.md`。本轮仅改tests/、tasks.md、JOURNAL.md、state.json。阶段与日志使用progress.py；不开batch flag，不改围栏，不直接git commit，不手动调用Stop hook。红档待登记与真实回执；收到前不能写T04实现。

B1仍为本地原型。观察fixture不是成人实验结果，所有真实T03答题来源仍simulation；不接真实OAuth、付费产品API或发布。
