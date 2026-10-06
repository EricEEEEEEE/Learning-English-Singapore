# T62A 本地 Google 登录配置证据

2026-10-06用户明确批准本地Google登录配置。

- 复用现有Learning English Singapore Preview Web OAuth Client；从现有Preview配置只读取得客户端字段，未新建客户端或轮换密钥。
- 本地.env.local已补齐GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、独立本地AUTH_SESSION_SECRET及APP_ORIGIN，权限0600，Git忽略；既有字段保持。证据仅记录存在性，不记录值。
- 在Google控制台增加http://localhost:3000/api/auth/google/callback，保存成功并重新打开确认，原Preview回调保留。
- 本地start接口实测302，目标accounts.google.com，回调地址正确，scope为openid email profile，PKCE为S256，设置事务Cookie。
- 普通应用首页→简体中文→Google入口已到真实Google账号选择页面，存在多个账号；由用户选择用于课程的账号。尚未获得已验证目标会话，不据浏览器账号外观绑定课程。
- localhost:3000预览独立运行；匿名session接口200且authenticated=false。请求输出关闭，避免OAuth回调临时代码写入日志。
- Next dev自动追加AGENTS.md及修改next-env.d.ts已逐项核对并恢复到原基线；未接受工具自动规则变更。
- 无新增AI调用、费用、发布或课程复制。现有991项代码回归证据沿用，本轮只改私有本地配置及Google回调，未重复运行全套。

私有截图：outputs/t62-local-login/google-local-callback.jpg，包含已保存localhost回调，无密钥或真实账号姓名/邮箱。

剩余验收：用户选择账号并完成登录；验证回跳和会话；确认课程副本绑定目标；再验证真实课程播放、四页及退出重登恢复。T62A尚未完成。
