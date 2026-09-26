# T61B AAC Data URI 传输适配检查点

红档 5315e78de3 后新增 submitEncodedVideoSegment。默认禁用，接收服务器内部编码结果及 reviewedSha256，复制音频并重算哈希，与结果哈希及确认哈希比对；检查格式标签、解码标记、时长及体积，再将精确字节放入 audio/mp4 Base64 Data URI。编码体积限制含 URI 前缀，固定既有模型/分辨率/帧率。复用单次 POST，未知提交不重试。

9项新题及全部T61B领域合计197项通过，typecheck/diff通过。日志 `.loopwork/logs/t61b-encoded-submit-green.log`、`t61b-encoded-submit-typecheck.log`。本轮未跑完整verify，无上传、无收费请求。

只读审查无当前内部适配器阻断，但它不是统一安全闸门：sourceSha256只校验格式，不读取原PCM；decoded、时长与听审确认须来自可信服务器记录，不能由客户端声明；旧HTTPS适配器仍保留，没有新增听审检查。生产runner必须统一费用与听审控制，再接所有提交路径。尚未落实听审记录持久化、实际供应商接受性或真实费用证据。
