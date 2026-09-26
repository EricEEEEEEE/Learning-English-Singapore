# T61B 已有酒店样片真实探测

2026-09-26，零供应商调用。未修改实现或冻结考题。

临时依赖只安装在Git忽略的outputs目录，禁安装脚本，项目package.json/lock未改。ffprobe-static@3.1.0的darwin/arm64文件经file确认实际为x86_64，本机执行bad CPU type。另用@ffprobe-installer/darwin-arm64@5.0.1，file确认arm64；手动补其本应由postinstall设置的用户执行权限后，版本实际为ffprobe n4.4.1。这是旧工具的本地已知样片验证，不作为生产或不可信媒体安全部署方案。

对public/media/hotel-pov-12s.mp4运行真实ffprobe成功（exit 0）：
- 容器12.042000秒；视频12.041667秒；音频11.987000秒。
- H264、720×1280、24fps；AAC音轨。
- 样片SHA256沿用已有记录：80dbb00f7c5f8392191e0afc2f9155826dd7f8179aae3de545e48538f380fd77。

将当前两个TS模块临时转译到outputs并运行probeVideoBytes，输入源时长12秒，返回Video probe failed（exit 1）。已知报告中最大时长差0.055秒，高于当前1/24秒容差，符合拒绝条件。此结果说明此前纯报告替身未覆盖实际容器/编码时长差；不能声称真实探测链路全绿。

下一步：核实容器舍入、编码时长与时间起点的允许范围，为真实报告补边界红题，再按回执调整实现。不要仅为让样片过关盲目放宽限制。原始报告与临时工具保存在outputs/t61-native-probe；不提交二进制工具或临时报告中的本地路径。T61B仍未完成，无新增费用。
