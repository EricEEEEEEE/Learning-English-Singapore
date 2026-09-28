# 2026-09-27 账单只读核对

通过用户已登录的LTX控制台页面读取，未充值、未改变自动充值、未打开密钥、未提交生成任务。报告不保存账户邮箱、卡号、付款ID或登录状态。

- Billing：余额USD10.16，AUTO TOP-UP Off / Not configured。
- Invoices：共1张，2026-09-24，Purchase USD5.45，Paid。
- Usage：September 2026、All API Keys、All Endpoints，共1请求，total cost USD1.09；2026-09-24 audio-to-video、ltx-2-5-fast、HTTP200，与既有酒店样片对应。

充值现金5.45与额度消耗1.09分别记账，不能直接重复相加。以上是控制台所示，非对未来延迟费用的保证。未据此计算精确可用总预算。

OpenAI用量页 https://platform.openai.com/usage 跳转登录页，当前浏览器未登录。已保留该页供用户登录；不猜账号、不读取密钥来代替账单权限。OpenAI两次TTS最终费用仍未核实，不能当成0。登录是账单核对所需操作，不是重复申请25美元授权。

官方 https://docs.ltx.io/pricing 于本日复核：audio-to-video按输入音频时长计费，ltx-2-5-fast 720p标价USD0.09/秒。该标价尚未说明之前1.08估算与1.09扣减差异原因，不能单独视为含税、取整等最终费用硬上界。Async Jobs文档也已打开核查，本轮未获得关闭全部费用不确定性的证据。

真实调用继续关闭，授权本身有效；真实执行模式隔离等离线开发不受登录阻塞。

## 2026-09-28 OpenAI登录后续核对

用户完成登录后只读查看Usage及Audio Speeches。筛选为Default project、All API sources、All API keys、Last 7 days（Sep21—Sep28）：首页Audio Speeches显示2 requests / 40 characters；语音分类页按Models显示tts-1、40 characters。与酒店样片记录的两次、40字符一致，但页面未提供逐请求关联证据。

首页Total Spend显示USD0.00（两位小数），组织September spend显示USD0.23。不能将前者当成语音免费，也不能将组织整月费用全部归到本项目。语音分类页显示字符用量，尚未取得精确费用账单；此前USD0.000600仍是估算。核对入口：https://platform.openai.com/usage/audio-speeches 。

本轮未生成、未充值、未修改账户设置；共用USD25绝对上限授权继续有效，无需用户再次批准相同额度。已消除登录阻塞，未消除实际收费上界与真实执行入口隔离的剩余工作。
