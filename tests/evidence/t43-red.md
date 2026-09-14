# T43 红阶段证据 · Google-first真实登录

- 范围：只写考题，不写OAuth实现、不创建Client、不发布、不接触密钥。
- Domain考题：Authorization Code + PKCE、每次随机state/nonce/verifier、五辅助语言、本地returnTo、交易封装防篡改与过期、真实start/callback route及Next GET接线、cookie属性与清除、token exchange携带原code_verifier、正常浏览器重放不重复exchange、恶意原cookie重放由Google一次性code拒绝且无session、默认验签拒绝alg=none与错误RS256签名、验签失败本地化收口、issuer+sub身份、错误audience/nonce/expiry/email验证拒绝。
- Browser考题：五种辅助语言均出现真实Google链接，微信仍明确未接入；五语言取消回调恢复辅助语言且保持未登录；恶意语言/外部returnTo不能操纵入口；微信WebView只提示转系统浏览器，页面不得宣称微信成功或G1通过。
- 历史合同迁移：T02只继续点击未接入的微信按钮；Google由未接入按钮升级为真实授权链接，仍禁止邮箱/密码/手机号表单。
- 真实OAuth、真机、回调与G1证据必须等实现、OAuth Client和HTTPS测试环境完成后另行记录，本红阶段不冒充。
- 最终红态：Domain 17/17失败，原因是`lib/google-auth.ts`及真实route尚不存在；small-phone 12/12失败，原因是Google仍为占位按钮、callback恢复与WebView引导尚未实现。两次命令均真实exit 1。
- 最终考题hash：`t43-google-auth.spec.mjs`=`983ae363fcd02e592d652ea94af67ef5c24a3fa53d97ac5158c3fa790e94f3e2`；`t43-google-routes.spec.mjs`=`060e615a1eaeea5565d52fe80a473527fc9f3fa9e21c6c6d96a32f7788eafe0d`；`t43-google-login.spec.mjs`=`cc44758d5e7253883b7372ba6015296acf5acb4e9e4a4fa0483f89109043375e`；迁移后的`t02-language-login.spec.mjs`=`375f2ec9358132ac96824b8d06a25005970434312df69cc4c38e288eb8f53781`。
- 独立只读终审：补齐真实GET接线、错误RS256签名、每次随机值、验签失败清理后通过；恶意原cookie重放按Google一次性authorization code拒绝且不建第二session，符合当前规格，不提前引入T13共享数据库。
