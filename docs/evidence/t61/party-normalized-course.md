# 聚会成片本地归一化与课程读取

2026-09-30。针对已验收两段预览做本地24fps归一化，完整对白34秒，尾部增加0.017秒音频填充以匹配已核验分段容器时长总和34.017秒。没有裁剪对白或放宽严格检查。

结果：视频24/1 fps、34秒，音频及容器34.017秒，零起点。通过现有verifyFinalVideo的实际字节绑定、严格帧率/时长检查与全片解码。通过assembleVideo私有保存和getCourse读取，10句、5回合、同版时间轴具备。

本地操作适配器固定两段已验收输入哈希及归一化输出哈希，未直接修改任务数据库。任务39197644-9f3b-47bd-af09-559cf28e35b5状态video_assembled。证据outputs/t61-party-multi/normalized-report.json、course.json、party-first-person.mp4和save-normalized.mjs。

范围：已有真实素材的本地处理已成功，生产concatVideoBytes仍是原流拷贝代码；不能宣称自动生成链路已修复相同问题。后续产品化应补红题并接入可验证的时间戳归一化。未新增API请求或费用。

课程内容尚有词组整句化与五语文案问题，当前结构有效不代表母语审查完成，尚未对外发布或迁移真实用户账号。

## 可复用拼接能力接续

在红档d9b13cfddd后，concatVideoBytes新增可选normalizeDuration，未传参数仍保持原流拷贝。13项定向测试通过。实际两段素材调用新能力后，经既有verifyFinalVideo验证返回24fps、34.017秒、decoded=true；结果outputs/t61-party-multi/automatic-cfr-check.json，输出automatic-cfr.mp4。

目前仍需任务层与runtime接入已验证时长；函数不自行决定可信时长，不能接受浏览器任意值，也不能以参数测试代替声画同步验收。独立静态审查有条件通过；未增加任何付费调用。
