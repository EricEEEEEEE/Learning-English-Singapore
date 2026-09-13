# 官方核查登记

核查日2026-09-13。已实际打开以下官方网页／作者仓库正文；部分Markdown地址被检索工具拒绝content-type，改读官方HTML。价格为公开标准USD，不含税、折扣、账号最低付款、演员制作和未列服务；实际端点权限均未登录验证。页面会变，运行前再核价并归档日期、实际模型返回值、插件锁文件和条款版本。本文不构成已取得商用／肖像授权的结论。

## OpenAI（保留批准的型号）

| 用途 | 拟用端点与版本 | 当日核实事实 | 未核实／执行前动作 |
|---|---|---|---|
| 规划与校验 | `POST /v1/responses`，`gpt-6-astra` | 标准文本每百万token：输入10、缓存输入1、缓存写12.50、输出50；>272K输入有加价。本包输入上限8K，不用Fast/Batch/Flex或工具调用。[模型页](https://developers.openai.com/api/docs/models/gpt-6-astra) | 页面只列同名ID，没有可另锁的日期快照；运行记实际返回model和时间，勿臆造快照 |
| 实时角色 | `/v1/realtime`，`gpt-realtime-2.1` | 每百万：文本输入4／缓存0.40／输出24，音频输入32／缓存0.40／输出64；不输出视频。[模型页](https://developers.openai.com/api/docs/models/gpt-realtime-2.1) | 页面只列同名ID；实际reasoning、VAD、语音token上限和模型资格待核。保持完整2.1，不悄换mini或SDK默认模型 |
| 示范、帮助 | `POST /v1/audio/speech`，`gpt-4o-mini-tts-2025-12-15`（已批准模型族的公开快照） | 文本输入0.60／百万、音频输出12／百万，模型输入最大2000token。[模型页](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)；可给速度／口音等指令，[TTS指南](https://developers.openai.com/api/docs/guides/text-to-speech) | 指令不保证新加坡真实性；marin/cedar仅首轮两角色候选，由X2盲评决定。两模式同voice名字不证明连续 |
| 新演员参考图 | `/v1/images/generations`或`/v1/images/edits`，`gpt-image-2.5-sunburst-2026-09-08` | 每百万：文本入5、图像入8／缓存2、图像出30；文字缓存1.25。官方特别说明不能用GPT Image 2计算器推算2.5图像token。[模型页](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst) | 本包不调用；预算token只为条件估计，先确认可限制的最大收费量。无授权资产不上传 |

自定义声音只有合资格客户可用，需分别提交同意录音与匹配样本，样本≤30秒、组织最多20声音；资格、本地演员授权及TTS补充条款均未落实。拟核验 `/v1/audio/voice_consents` 和 `/v1/audio/voices`，不会上传任何录音。官方示例中Realtime型号不能代替本项目2.1的实际兼容验证。[Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)

## 视觉与编排

| 路线 | 当日核实事实 | 版本／权限缺项 |
|---|---|---|
| Runway Characters / GWM-1 | LiveKit插件源码用 `gwm1_avatars`，接外部音频并调用 `replace_audio_tail`；这支持组合可行性的推断，尚未证明本项目两条独立链。[插件源码](https://github.com/livekit/agents/blob/main/livekit-plugins/livekit-plugins-runway/livekit/plugins/runway/avatar.py)、[官方接入](https://docs.dev.runwayml.com/characters/livekit/) | API文档系列2024-11-06；实际SDK、插件版本、actor ID、API返回模型标识在T09锁定。不能把main分支当不可变锁定 |
| Runway会话限制 | Characters概念页说明单会话最大5分钟；这是供应商上限。本包20分钟是实验总体上限，每个Runway流最多5分钟，临近上限结束且不自动续费开新流。[概念页](https://docs.dev.runwayml.com/characters/concepts/) | 连续5分钟课件是否有接续空隙须X3/X4实测，不能减少矩阵来假装通过 |
| Runway价格 | credit＝USD0.01；`gwm1_avatars`每流启动2credits，随后每6秒2credits。[官方价格](https://docs.dev.runwayml.com/guides/pricing/) | 计费取整、排队与建角收费、最低充值、税与取消结算仍待账号核验。预算对时段向上取整，准备时段也预留 |
| Simli对照 | 官方LiveKit示例接OpenAI Realtime；文档索引包含Compose token、静态视频、会话历史和active count。[接入](https://docs.simli.com/api-reference/livekit)、[索引](https://docs.simli.com/llms.txt) | 本项目接Compose外部音轨，不以Simli Auto的其他声音模型替代。拟 `/compose/token`，实际基址、model/face类型、SDK补丁版本、停止调用和录存资格在T09核实 |
| Simli价格 | 首页只公开注册赠额与月度免费分钟，以及付费按量／折扣；未能从公开正文核实该Compose路线现行单位价。[官方首页](https://www.simli.com/) | `/pricing`未成功打开，官方域搜索未补足。赠额不能证明免费资格；不据第三方报价填数字。预算中单列150美元条件额度建议，单位价待A2；额度建议绝不是费用估计或执行许可 |
| LTX音轨短片 | `POST /v2/audio-to-video`，显式指定 `ltx-2-5-fast`、720p、24fps；输入音轨决定时长，720/1080p最大20秒；jobID不是可播帧。[端点](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video)、[型号](https://docs.ltx.io/models/ltx-2-5) | 本包10秒固定片段；长课件按片段拼接并核音轨保持。执行须锁实际响应版本，无声轨替换假设 |
| LTX价格／退役 | 该路线按输入音频秒数：720p0.09、1080p0.13美元。旧 `ltx-2-fast/pro` 已移除，v1生成接口弃用。[价格](https://docs.ltx.io/pricing)、[变更日志](https://docs.ltx.io/api-changelog) | 不沿用旧型号价，不自动选择旧默认模型；API托管条款和删除/取消效果仍待确认 |
| LiveKit | 官方Python示例 `livekit-agents[openai]~=1.5`，默认model仍可能是 `gpt-realtime`，本项目必须显式配置2.1。[插件文档](https://docs.livekit.io/agents/models/realtime/plugins/openai/) | 此版本范围不是可复现锁文件。T09安装后分别固定agents/openai/runway/simli及服务器/egress版本和hash。本包未安装这些依赖 |
| LiveKit Cloud价格 | Ship起价50美元/月；超额agent分钟0.01、WebRTC分钟0.0005、下行GB0.12、视频转码分钟0.02、raw track导出分钟0.001；录音0.005/分钟、事件0.00003/条另计。[官方价格](https://livekit.com/pricing) | 免费额度、实际路由/参与者数、税和账户计划待核。不把网页估算的LLM每分钟价套用OpenAI直连token；自托管也不是免费服务器承诺 |

## 许可分开登记

| 对象 | 已核查的许可来源 | 本项目当前结论 |
|---|---|---|
| LiveKit Agents代码/插件 | [仓库LICENSE](https://github.com/livekit/agents/blob/main/LICENSE)：Apache-2.0 | 仅代码许可。采用时保留要求的notice；LiveKit Cloud服务、供应商模型、素材权利分别检查 |
| Simli示例代码 | [官方示例LICENSE](https://github.com/simliai/simli-openai-realtime/blob/main/LICENSE)：MIT | 可作为代码参考；不覆盖Simli模型或脸模/声音/输出许可。当前托管条款从[Legal入口](https://www.simli.com/legal)登记待账户确认 |
| LTX模型/相关代码 | [根许可指针](https://github.com/Lightricks/LTX-2/blob/main/LICENSE)及[LICENSE-2_x](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x)：2026-08-11 LTX-2.x Community License | 非MIT；条款对年收入至少1000万美元主体的商用许可有额外要求及非商用例外。A3主体/使用性质未核实，不作法律放行。基础编码器/其他权重各有独立条件，API托管使用另核服务条款；本包没有下载代码或权重 |
| Runway托管服务与输出 | [官方输出说明](https://docs.dev.runwayml.com/assets/outputs/)要求保存临时输出；[署名说明](https://docs.dev.runwayml.com/usage/attribution/) | 输出可下载不等于本项目获得全部权利；确认具体条款、固定课件导出/重播许可及署名义务后才能接入 |
| 演员/背景/声音素材 | 素材登记须含作者、来源URL、hash、许可版本、用途、到期及撤回联系人 | 真实素材0；B1只有本项目程序绘制的SVG与通用文案。不能从仓库代码许可推导肖像/voice授权 |

账号、许可或现行价格未能核实的格子保留缺项，继续原批准路线的准备；不能自动换模型或替用户申请账号。
