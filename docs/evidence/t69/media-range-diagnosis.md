# T69 · 实现检查点与媒体替身诊断

实际核验红回执cdc0b3bd8f后才implementing。已接线主入口guided观看、同版需求身份说明、三步学习、对方先开场与手动继续；旧/demo四页保留。watch对象同owner保存pointer与requirement，组件显式guided且缺失/非法/错版上下文拒绝，不静默退回酒店。五语文案和少量当前步骤样式接入；新需求/换课初始化清time/error并停止旧播放。

## 实际验证

- 初版类型检查与生产构建exit0，日志`.loopwork/logs/t69-pre-ui-build.log`。
- phone T69全17逻辑+T68补证3项，共20项：18通过、2失败，exit1、13.5秒，日志`t69-phone-green.log`。该结果在随后初始化time/error重置前，不当最终版本全量通过。
- 失败为完整观看ended未出现提示，以及词组设置currentTime=1后实际从0播放。没有修改冻结测试或降低起止要求。

## 同代码对照

临时脚本`tmp/t69-debug/run.mjs`给真实HTMLMediaElement安装事件观察，记录setter、seeked、playing及ended；没有改产品播放器或伪造currentTime。使用合成鉴权/课程协议替身与既有酒店bytes。

1. 原T69沿用T68媒体替身，默认200整片。metadata为12.041667秒、readyState4；设置1或duration后，setter和seeked结果仍为0。完整提示不出现。脚本exit0，日志`t69-media-debug-final.log`。
2. 仅在临时debug页覆盖媒体响应为标准Accept-Ranges/206/Content-Range/Content-Length，同一构建的播放器设置duration后到12.041667并出现完成提示，设置1后seeked为1。脚本exit0，日志`t69-media-range-control.log`。
3. 原临时脚本首次缺少独立浏览器baseURL，导航失败exit1，日志`t69-media-debug.log`；补上baseURL后才取得上述对照，不把环境失败作业务证据。

产品实际`app/api/generated-course-media/route.ts`已有标准Range支持；本次问题是T69测试媒体替身未模拟该协议。只读审查员复核对照与真实接口后同意局部修正T69 fixture，不扩大改动共享旧题。

**证据边界**：对照只观察词组开始约100ms及seek到片尾后的事件，不证明实际完整12秒观看或原音已播到end±0.1，也不证明邻接台词样本级隔离。18/20不算技术全绿，T69不勾选、不登记green。

## 合规接续

1. NOW登记note，归档当前实现/台账/诊断；不改冻结tests/spec/rules/hooks。
2. 等实际note回执后复位test-writing，仅给T69媒体fixture提供与真实接口一致的Range响应。全部旧断言、题数和阈值保留，记录原失败与对照，不假称新实现跑红。
3. 登记纠错red并等回执，再implementing，重建后跑定向、真实Next HTTP及实际媒体停止边界、原默认完整verify和独立审查。

没有模型请求、新增费用、密钥、规矩或发布操作；未手动commit或调用stop_hook。当前源码检查点不是T69验收，播放位置/学习step持久仍由T70接续。
