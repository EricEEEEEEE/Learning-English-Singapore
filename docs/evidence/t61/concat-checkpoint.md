# T61B 本地视频拼接执行器

红档274e239d36后新增concat-video-bytes.ts。异步前复制并核对最多4段输入哈希，累计输入100MB；临时目录内固定文件名和安全concat清单，execFile无shell、仅file协议、60秒/1MB输出缓冲，stream copy映射首路视频和音频，限制输出100MB。失败或清理失败不返回成功。

5项新考题和7项时间轴回归共12项通过（exit 0），typecheck/diff通过；日志t61b-concat-green.log与t61b-concat-typecheck.log。只读静态审查通过。未跑完整verify或真实ffmpeg。

必须继续验证：输出达到或接近大小上限可能被截短；不能靠大小证明完整。不同分段即使同为H264/AAC、尺寸/帧率相同，也可能因编码参数差异无法正确stream copy；必须对成片重探测、解码和播放检查。file协议不等于系统沙箱。当前仅执行器，不发布课程ready，无费用，T61B仍未完成。
