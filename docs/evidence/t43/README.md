# T43 · Google-first 外部验证证据

本目录只保存脱敏后的结论，不保存账号、OAuth code、state、nonce、PKCE verifier、cookie、ID token或client secret。

## 已取得的真实证据

- Google Auth Platform应用为External / Testing，Preview origin与callback均指向同一稳定HTTPS别名。
- Vercel Preview启用Standard Protection；生产环境未更新。
- Desktop Chrome在五种辅助语言中分别完成真实Google授权。每次都返回同一Preview别名，前端等待服务端session确认后才显示对应语言的成功文案，随后地址栏回到`/`。
- 远端匿名请求用伪造state与伪造code访问callback，返回302并跳到`auth=invalid_transaction`；响应清除交易cookie，后续匿名session仍为`authenticated:false`。
- 首次真机尝试的脱敏日志显示start、callback和session均到达服务端，但旧前端仍回到登录选择。修复后，同一受保护Preview已用真实Desktop Chrome复测：服务端session确认后自动进入第1/12题，回调参数被清理；随后实体iPhone Safari同机复测也通过。
- 2026-09-21在同一真实Desktop Chrome登录会话继续完成引导并进入用户自述场景；场景准备的模拟失败可只重试失败部分，恢复后出现“预览听与练”入口。浏览器状态仍显示Google登录成功。该记录证明桌面会话连续性，不替代物理手机证据。
- 用户确认修复后的同机流程已在实体iPhone Safari完成：Google授权后没有再回到登录选择，随后完成引导、进入用户自述场景并到达“预览听与练”入口。该结果对应预注册行`X1-091`；iOS具体版本未报告，未保存账号、回调参数、token或cookie。

`docs/experiments/b1/matrix.csv`是不可覆盖的预注册计划，全部X1行继续保持`未测/planned`。本次实际执行的5个Desktop Chrome同机路径与1个Desktop Chrome无效state路径在本目录的`result.json.attempts`中按plan ID逐条记录expected、actual与证据引用，不把自动化或桌面模拟冒充真机证据。原始callback不持久化，因为它含一次性code/state/cookie；只保留脱敏后的状态码、结果、cookie清除与session判定。

## 自动化证据边界

`tests/domain/t43-google-auth.spec.mjs`、`tests/domain/t43-google-routes.spec.mjs`和`tests/e2e/t43-google-login.spec.mjs`覆盖取消、state失效、正常及恶意重放、token交换网络失败、ID token验签/claims、五语言恢复与WebView外部浏览器指引。这些考题证明实现逻辑，但不替代物理手机和嵌入式浏览器实测。

## T43完成边界与剩余计划

- 至少一部真实手机同机Google授权条件已由iPhone Safari满足；设备类别与系统浏览器已记录，iOS具体版本仍未知。
- 自动回归已改用Playwright 1.63.0配套的固定Chromium revision 1243，不再跟随系统Chrome channel；未放宽20秒单项超时。2026-09-21完整验证`373/373`、exit 0，日志为`.loopwork/logs/verify-20260921-140711.log`。
- T43只证明Google-first：实体iPhone Safari的`X1-091`满足“至少一部真实手机同机授权”，安全失败路径由自动化覆盖。iPhone Safari其余语言与失败路径、Android Chrome及嵌入式浏览器实际环境继续保持`planned`，不冒充真实设备证据。
- OAuth Client有一个未使用的旧secret；当前Preview使用后创建的secret。停用旧secret需要单独批准，不影响本次Google-first能力结论。
