# T66 · 场景输入与可逆导航红考题

依据：spec K2.1–K2.3，K1的语言/会话边界；已批准C2F。前置T65绿回执`e93267754a`已核实，Stop复验全绿，本圈第4轮。

## 范围与发现清单

- `t66-scene-entry.spec.mjs`：14条逻辑用例——单场景框/三个示例/下一步、列表外母语、三种示例的编辑和不自动提交、空值/全空白就地提示及恢复、往返修改、2000字既有上限、账号切换、五种辅助语言下的反馈与往返。
- `t66-entry-regressions.spec.mjs`：5条逻辑用例——未知auth通知、同账号校验后焦点/选区、A/B乱序响应、JSON体挂起期限、根页localStorage不可用。
- 三种既有视口运行，共新增57项；发现清单1089项/99文件，`npm --prefix tests run list` exit0，日志`t66-list.log`。原1032项不删改。

下一页只考标题、本次描述和返回这一必要导航终点；6关键词字段和需求持久化留T67，真实任务/状态留T68。本题不生成课程、不接入模型，不凭已有聚会课假装新需求已有结果。

## 可证伪检查

| 用户行为 | 改坏后应红的位置 |
| --- | --- |
| 点击示例仍能编辑，且不自动提交 | 去掉填值/焦点、点击时推进页面或创建任务，示例题/请求防线应失败 |
| 任意母语需求原样返回 | 固定套模板或返回清空描述，自述/编辑往返题失败 |
| 空白不是有效需求 | 删除trim检查或不关联/不展示错误，空值题失败 |
| 五语是功能可走通 | 缺翻译动作、反馈或导航状态，语言题失败；文字未母语审校的状态不因测试通过改变 |
| 换账号不显示旧需求 | 复用旧账号页面/草稿，换号题失败 |
| 校验后可以继续原位置输入 | 重建输入框不恢复焦点/选区，连续输入题失败 |
| 迟到身份不能覆盖新身份 | 移除请求序号保护，先B后A题使B草稿消失或被覆盖 |
| 截止时间覆盖读取体 | 在headers阶段清除计时器或不传AbortSignal，body题等不到重试 |

## 替身边界

会话使用合成owner，外部请求被拦截。场景页非GET生成请求直接报错；示例/前后导航不得创建任务。

乱序题刻意让会话fetch替身忽略AbortSignal，再以两个可控响应先返回B、后返回A，用于验证迟到结果保护，而不是只测浏览器取消。JSON题刻意让headers阶段的Promise先resolve，再让json()挂起直到AbortSignal拒绝读取；这是合成传输语义测试，不冒称实际HTTP流或网络实测。

## 独立审题

判卷员核实19条逻辑用例，无错误断言或越入T67/T68的强制要求。已采纳红档前补强：五语错误用正向文案断言，示例独立语义容器恰好3个按钮。未在测试运行中改用例/断言，补强后另跑受影响题并保留此前输出；独立再次审题确认是加强断言，范围不变。HTML样式描述的惰性展示/XSS专项记NEXT，不据本题宣称已覆盖。

## 实际红运行

1. `npm --prefix tests test -- t66-scene-entry t66-entry-regressions --project=phone`：exit1，19项实际运行，15失败、4通过，摘要3.3分钟，日志`.loopwork/logs/t66-phone-red.log`。14个K2场景题因缺少示例/下一步等控件而红；另1个连续输入题实际收到`Expected: focused / Received: inactive`，复现同账号校验后丢焦点。4项既有保护通过：未知通知不崩溃、迟到A不能覆盖B、headers已返回但body挂起仍可超时、storage不可用仍可选择语言/输入。
2. 上述运行结束后才加强两处断言。仅重跑受影响的6条phone题：`npm --prefix tests test -- t66-scene-entry --project=phone --grep 'scene page has one free input|has localized choices'`：exit1、6失败，缺少示例控件；日志`.loopwork/logs/t66-strengthened-red.log`。这是补强后的追加结果，不与首轮失败重复相加。

失败均为真实功能/焦点断言，非服务启动或环境失败。small-phone/desktop尚未运行新增题；1089是最终发现总数，不假称全量已验证。未改app/lib/spec/rules/hooks，也没有运行实现；红档仍以随后Stop真实回执为准。

## 定位纠错补红（2026-10-16）

T66原红档721c1a3bce和实现检查点93192a233f均获真实回执。实现后phone首轮13通过、6失败；这6项同时命中业务错误与Next.js空播报器，证据`t66-phone-green.log`保持，不改写为产品行为失败。

收到实现检查点回执后回到test-writing。本次唯一用例改动：4处`page.getByRole('alert')`限定为`page.getByRole('main').getByRole('alert')`。逐字校验after等于before的这4处替换；toHaveText/toContainText、aria-invalid、aria-describedby关联、清除后0条错误、零任务请求及其他全部断言原样保留。没有使用.first()或改/藏框架播报器，也没有产品代码修改。独立只读逐字复核通过，属于纠正定位歧义，不是放宽断言。

纠错后完整19条phone复验：exit0、19/19通过，6.8秒，日志`.loopwork/logs/t66-scoped-phone.log`。最终发现清单仍为1089项/99文件，`npm --prefix tests run list` exit0，日志`t66-scoped-list.log`。这是纠错后定向结果，不代表1089全量通过。补红回执后回implementing运行原默认300秒完整verify；本轮无app/lib/spec/rules/hooks改动。
