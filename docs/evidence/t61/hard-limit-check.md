# T61B硬限额只读核查（2026-09-28）

- 已收到83f8e954f9回执。代码未改，最近完整回归847项通过，本轮没有重复跑测试。
- 官方文档：https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/spend_limit/methods/retrieve ，提供项目硬限额和enforcement.status（inactive/enforcing），金额为美分、周期month。文档存在不等于当前项目已启用。
- 已登录账户组织Limits页面显示本月0.23/100美元，并提示实际费用可能超过；自动充值余额5美元恢复到50美元，月自动充值上限100美元。
- Edit spend limit窗口显示金额100，Enforce a hard limit关闭。仅打开查看，没有改值或保存。不能把组织支出0.23全部归属本项目。
- 更正：旧文档关于平台无硬限额的笼统结论不再适用；当前账户确有该选项，但尚未启用，尚未验证项目级覆盖与含税结算语义。
- 共享25美元累计绝对上限仍有效，不再次询问预算金额。组织级修改可能影响其他项目，需具体设置方案授权；月度限制也不能独立代替跨月份、跨OpenAI/LTX累计账本。
- 本轮新增付费请求0，账户配置修改0。真实新课程尚未生成；已完成的是离线适配与现有媒体全链路验证。

## 项目列表补充核查

- b8c7daa9f6回执已核对。账户Active项目列表仅显示Default project，月支出0.23美元；可归属Default project，但不能据此全部归属本产品。未见独立Learning English Singapore项目。
- 尝试页面现有项目名称及行入口后页面未进入详情；项目级硬限额实际状态仍未读到，不推测已启用或不存在。组织配置保持原样；新增费用0。需用户打开目标项目的Limits页面后继续只读核验，无需再次批准25美元预算。

## 项目限额页面已恢复

- 用户重新打开后台后，成功读取Default project的Limits：No spend limit set。打开Set spend limit弹窗，存在Monthly spend limit及Enforce a hard limit（关闭）。未填写、未保存；已刷新退出。此前页面阻塞解除。
- Default project同时承载其他应用密钥，因此不能未经授权设置低额度影响其他应用。本产品命名密钥本月显示0.00（两位小数，不代表零实际费用），其他应用有0.23显示；没有读取完整密钥。
- 建议下一步授权创建独立Learning English Singapore项目，后续确认专属限额、密钥安全保存及实际执行状态；不修改默认项目和组织自动充值。创建独立项目本身不证明跨供应商25美元累计上限已满足。新增请求0、费用0、配置修改0。

## 独立项目硬限额已配置

- 用户授权继续完成独立项目配置，已为Learning English Singapore设置每月1美元并启用Enforce a hard limit。保存后显示0.00/1.00及Requests will start to fail when limit is reached。截图outputs/t61-project-limit.png。默认项目、组织自动充值保持原样。
- 重要：开启时平台明确提示enforcement is not instantaneous，最终用量可能少量超出。因此硬限额确实存在且已启用，但仍不能证明绝对零超额，也不是跨供应商累计总额保证。保留25美元绝对约束；尚未新增收费请求。
- 新项目密钥迁移待安全设置流程，旧密钥未撤销；未宣称迁移完成。

## 2026-09-30新密钥本地迁移验证

- 用户自行创建新密钥并通过本机一次性输入页保存，服务返回SAVED_OK后退出；.env.local更新时间2026-09-30 11:04:19，权限0600，Git忽略。未输出密钥。
- GET https://api.openai.com/v1/models，携带新密钥和独立项目OpenAI-Project头，实际HTTP200；脚本及语音目标模型均在列表。证明当前鉴权请求被接受，不等于生成接口、费用或媒体质量已验收。未调用推理/语音/视频生成。
- 原Default project未删除，服务端旧密钥未撤销；本地OPENAI_API_KEY已替换为用户输入的新值。旧密钥撤销仍须点名确认目标，避免误伤其他应用。
- 月度1美元保护不能代替跨供应商25美元累计绝对上限，真实试跑边界仍按既有证据处理。
