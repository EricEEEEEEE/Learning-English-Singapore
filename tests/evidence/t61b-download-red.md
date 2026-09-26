# T61B 素材下载红题

2026-09-26。最终16例，命令`npm --prefix tests test -- --project=domain t61b-download.spec.mjs --max-failures=1` exit1：首例缺download-generated-media.ts，15未运行，日志.loopwork/logs/t61b-download-red-final.log。

原15例只读复核通过；补IP被误允许时仍拒绝的独立断言，合成超限流最多3块避免错误实现无限分配。覆盖允许主机/协议/凭据/端口、无供应商凭据下载、禁止重定向、流式大小/hash、错误脱敏及不重试。

只验证字节传输，不证明视频时长或可播放。服务端允许主机不可来自浏览器；域名白名单不等于DNS完整防护，实际下载接线还须使用可信供应商域名并核对解析/网络边界。Content-Length与压缩传输需谨慎处理。无外部下载或收费请求。
