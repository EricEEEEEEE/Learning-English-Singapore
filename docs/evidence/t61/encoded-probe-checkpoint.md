# T61B 实际提交 AAC 时长校验检查点

红档 a0ede53acf 后，probeVideo 对 encoded job 使用持久 audioDuration，缺失或非法时拒绝；legacy job 仍使用原始 PCM 时长。探测输入和返回报告使用同一预期时长，保存前比较视频 job、素材、原始音轨快照，拒绝过期结果。

两条新题红转绿：2.08秒AAC以2.08秒探测；1.94秒视频虽然落在原2秒PCM容差内，仍因偏离实际提交AAC超过容差而拒绝。T61B领域213 passed（3.6s）、typecheck exit0、diff检查通过。日志 t61b-encoded-probe-green.log、t61b-encoded-probe-types.log。首次实现误改了转码函数变量，typecheck及测试揭示后修复；最终diff仅probeVideo。本轮未重跑完整verify。

只读静态复核无阻断。仍为内部simulation，无真实付费请求。下一步核查多段时间轴与成片验收的PCM→AAC→视频累计容差，不能凭单段通过宣称全链路完成。
