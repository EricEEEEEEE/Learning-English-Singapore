# T61B 合成账号真实 HTTP 播放取证

在 f92f661cad 回执后执行零费用集成实验，不修改代码或考题。使用单独的合成会话密钥、两个 example.invalid 合成账号与已存在酒店样片；测试任务显式 simulation=true。fixture 直接写入本地任务记录，finalVideo 等状态为测试准备，不代表真实生成或组装流程运行过。

实际生产构建服务监听独立本地端口，由原有签名会话、SQLite 任务存储、私有媒体存储和 Next 路由处理请求；没有 page.route 接口替身。结果：

- 本人课程 GET 返回 200，ID 正确。
- 本人媒体 GET 返回 200，全文件 SHA-256 与既有样片一致。
- 本人 bytes=0-31 返回 206、32 字节。
- 另一合成账号请求课程及媒体均返回 404、private/no-store。
- 390×844 headless Chromium 使用签名 Cookie，实际进入任务列表、打开私有课程、播放至 currentTime>0.1、切换句子页、返回后 video 元素移除。

实验脚本退出 0。结果与脚本保存在忽略目录 `outputs/t61-http-live/`：prepare.mjs、check.mjs、result.json；截图 private-course.png 已人工视觉检查。截图显示测试材料提示、四页按钮与真实酒店样片，无真实账号资料。该截图只截视口，句子内容位于下方，脚本另验证句子元素存在。

浏览器验证使用合成签名会话，不是 Google OAuth 真人登录验收，也不是 iPhone Safari 真机验收。没有新的模型请求、收费或部署。独立服务已停止；合成私有 fixture 保留在本地供复核，不进入公开目录或 Git。真实生成整条链路与费用边界仍待完成，T61B 不勾选。
