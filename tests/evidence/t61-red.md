# T61A 生成任务红考题

2026-09-25，仅考题，不执行外部供应商请求。

最终枚举14例：11条领域/接口用例、1条页面用例在三种尺寸执行。
最终domain首失败运行exit1，lib/generation-tasks.ts尚不存在，1失败10未运行；UI未运行，不宣称14例全红。日志.loopwork/logs/t61-red-final.log。

覆盖：签名会话归属、跨对象并发去重、换请求key的同需求去重、版本隔离、生产模式禁止provider、模拟预留先落盘、未知提交与成功待查询均不可重复提交、真实HTTP身份及私有响应、页面明确等待费用且尚未生成。

独立复核后补独立子进程：在模拟供应商回调处exit17，另一个进程读取要求submission_unknown且保留预留，随后重试拒绝。helper为测试专用TypeScript加载器，退出的是测试子进程，不中断服务。此用例尚未实际执行通过，不能提前声称实现可恢复。

模拟模式仅由测试store配置启用，浏览器请求的approved/simulation不得开启生产供应商。测试函数永不访问外部网络；不得把测试job状态称为真实生成。

## 2026-09-25路径纠错

实现先记事存档bc4036ab34后，切回test-writing。两处child.pathname改为Node标准fileURLToPath(child)，解决项目目录空格编码；未改任何业务断言。纠正后domain11/11通过，exit0，独立子进程确实exit17，另一进程恢复submission_unknown及原预留。日志.loopwork/logs/t61-path-correction.log。

本次红档类型用于冻结更正后的考题，不宣称纠正后出现新业务失败；原实现前红证据仍为ee4e474cce。完整新旧回归尚未运行。
