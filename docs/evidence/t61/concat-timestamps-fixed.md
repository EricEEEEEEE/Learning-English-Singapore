# T61B 拼接执行器真实时间戳修复

红档adee251bf1后，执行器增加输入前-copyts与输出侧-avoid_negative_ts disabled，其他限制不变。旧偏移不通过改字幕补偿。

6项定向测试exit 0、typecheck/diff通过；只读静态复核通过。将当前执行器临时转译，真实拼接两份已有酒店样片exit 0，输出2950987字节，SHA256 608e6efe124792cc3bb51992c4398b2729c77701dd933f874ff001dfd1a2990c。

真实ffprobe：容器24.084000秒，音视频起点均0.000000；视频578帧，音频564包。代码断言上述容器时长与双起点，exit 0。真实FFmpeg -v error -xerror全片音视频解码exit 0。

证据：outputs/t61-native-concat/runner-fixed.mp4及runner-fixed-probe.json；日志t61b-concat-ts-green.log、t61b-concat-ts-typecheck.log、t61-runner-fixed-decode.log。

限定：两份同一样片，不是不同生成片段的编码兼容或角色连续性验证；未逐点听审，不宣称所有素材声画同步。未跑完整verify；课程组装、最终媒体验证与任务发布仍待，T61B不勾完成，无API费用。
