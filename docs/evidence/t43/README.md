# T43 · Google-first 外部验证证据

本目录只保存脱敏后的结论，不保存账号、OAuth code、state、nonce、PKCE verifier、cookie、ID token或client secret。

## 已取得的真实证据

- Google Auth Platform应用为External / Testing，Preview origin与callback均指向同一稳定HTTPS别名。
- Vercel Preview启用Standard Protection；生产环境未更新。
- Desktop Chrome在五种辅助语言中分别完成真实Google授权。每次都返回同一Preview别名，前端等待服务端session确认后才显示对应语言的成功文案，随后地址栏回到`/`。
- 远端匿名请求用伪造state与伪造code访问callback，返回302并跳到`auth=invalid_transaction`；响应清除交易cookie，后续匿名session仍为`authenticated:false`。
- 首次真机尝试的脱敏日志显示start、callback和session均到达服务端，但旧前端仍回到登录选择。修复后，同一受保护Preview已用真实Desktop Chrome复测：服务端session确认后自动进入第1/12题，回调参数被清理。真机仍须在修复版本重测。
- 2026-09-21在同一真实Desktop Chrome登录会话继续完成引导并进入用户自述场景；场景准备的模拟失败可只重试失败部分，恢复后出现“预览听与练”入口。浏览器状态仍显示Google登录成功。该记录证明桌面会话连续性，不替代物理手机证据。

`docs/experiments/b1/matrix.csv`是不可覆盖的预注册计划，全部X1行继续保持`未测/planned`。本次实际执行的5个Desktop Chrome同机路径与1个Desktop Chrome无效state路径在本目录的`result.json.attempts`中按plan ID逐条记录expected、actual与证据引用，不把自动化或桌面模拟冒充真机证据。原始callback不持久化，因为它含一次性code/state/cookie；只保留脱敏后的状态码、结果、cookie清除与session判定。

## 自动化证据边界

`tests/domain/t43-google-auth.spec.mjs`、`tests/domain/t43-google-routes.spec.mjs`和`tests/e2e/t43-google-login.spec.mjs`覆盖取消、state失效、正常及恶意重放、token交换网络失败、ID token验签/claims、五语言恢复与WebView外部浏览器指引。这些考题证明实现逻辑，但不替代物理手机和嵌入式浏览器实测。

## 尚未满足的T43退出条件

- 至少一部真实手机完成同机Google授权并保留脱敏结果。
- 修复后真机重测需记录设备系统与系统浏览器；首次失败不能替代通过证据。
- 2026-09-21完整372项验证已真实启动，但Chrome首个本地文档请求在页面完成渲染后仍超过冻结的20秒`load`等待，故停止并记为环境失败；typecheck、production build与T43 domain 17/17保持通过，不能据此记整套全绿。
- iPhone Safari、Android Chrome、iPhone/Android WeChat等实际环境仍须逐格执行；没有真实设备的格子继续保持`planned`。
- OAuth Client有一个未使用的旧secret；当前Preview使用后创建的secret。停用旧secret需要单独批准。
