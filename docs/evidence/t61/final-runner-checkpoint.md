# T61B 成片字节绑定与全片解码检查点

红档 093d8f3969 后新增 `lib/verify-final-video.ts`。异步前复制输入并验证 SHA-256，写入私有临时文件；同一文件先通过 ffprobe 报告校验，再经 ffmpeg 双轨全片 `-xerror` 解码。任何一步失败或清理失败均不返回成功。子进程不使用 shell，单次超时 60 秒、输出上限 1 MB。

定向测试预期 11 项，实际 11 项通过（执行器 4 项、报告校验 7 项），typecheck 与 diff 检查通过。日志：`.loopwork/logs/t61b-final-runner-green.log`、`t61b-final-runner-typecheck.log`。

完整 verify 首次因沙箱监听 127.0.0.1:3210 的 EPERM 中止；获准在沙箱外原样重跑后 exit 0，723 项通过（4.4 分钟）。完整日志：`.loopwork/logs/verify-20260926-105125.log`。这验证当前回归集，不代表 T61B 尚未接线部分已经完成。

对已有酒店样片的两段拼接文件实际执行验证，返回 24.084 秒、720×1280、H264/AAC、平均帧率 23.99967560992093、decoded=true。输入 SHA-256：`608e6efe124792cc3bb51992c4398b2729c77701dd933f874ff001dfd1a2990c`。本地结果：`outputs/t61-native-concat/final-verified.json`。未生成新视频，没有付费调用。

只读复核未发现当前切片阻断问题；指出输入并发修改、部分写入失败、清理失败、超时及 stderr 专项覆盖仍不足。真实解码成功不证明对白内容、口音或接缝听感。工具仍为本地实验版本，尚未接入任务最终发布，也不代表完整 T61B 验收。
