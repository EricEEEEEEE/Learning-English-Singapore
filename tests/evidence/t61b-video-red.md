# T61B 视频提交和查询红题

2026-09-26。19例，最终命令`npm --prefix tests test -- --project=domain t61b-video.spec.mjs --max-failures=1` exit1；首例缺lib/generated-video.ts，18未运行。日志.loopwork/logs/t61b-video-red-final.log。

依据官方https://docs.ltx.io/async-jobs及A2V参考，已核对v2提交202/id、原ID查询、pending/processing/completed/failed与result.video_url。不联网调用供应商，所有HTTP响应合成。

复核原17例设计通过；补2例输入合法性与查询失败脱敏。供应商completed不等于课程ready；声明duration不证明实际音轨时长，后续须绑定已测资产/hash。HTTPS链接不等于可以安全下载，下载模块另验目标与重定向。未证明持久提交、跨进程恢复或完整生成链路。
