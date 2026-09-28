# 运行入口媒体工具预检

2026-09-28，红回执d3a1b2c344。新增prepareLiveGenerationRuntime作为实际执行前准备入口：快照配置并校验，依次execFile启动ffmpeg/ffprobe的-version，10秒超时、1MB输出限制，版本头匹配后才返回分步runtime。失败不返回操作对象，不调用供应商，不输出子进程原始错误。

14项预检及运行入口测试通过，typecheck和diff检查通过。全部使用合成工具、凭据和传输，费用0。只读静态审查无阻断，未独立跑测试。

边界：版本探测不证明编解码能力；低层createLiveGenerationRuntime保留供内部组合，未来实际执行必须用prepare入口，不能声称所有调用全局强制预检。工具进程默认继承环境，不声称其与环境凭据隔离。下一步用prepare入口集中验证实际工具和替身供应商的多段课程全链路。

完整验证verify.sh exit0：847 passed (4.6m)，日志.loopwork/logs/verify-20260928-164009.log。无真实付费调用。
