# Learning English in Singapore

本地流程演示，当前实现 T01 的手机布局与可展开说明。真实登录、语音、
视频和完整学习流程尚未接入；无需 API key，不会申请麦克风权限。

## 本机运行

已测环境：Node 24.15.0、npm 11.12.1。浏览器考题还需要本机 Google Chrome。
在项目根目录执行：

```sh
npm ci --ignore-scripts --cache ./tmp/npm-cache
npm --prefix tests ci --ignore-scripts --cache ./tmp/npm-cache
npm run dev
```

打开 <http://127.0.0.1:3000>。服务只监听本机回环地址；按 Ctrl-C 停止。
点击“查看演示说明”，确认展开／收起及键盘 Enter 操作可用。

## 验证与生产模式预览

```sh
bash .loopwork/hooks/verify.sh
npm run start
```

验证依次执行类型检查、生产构建，以及 3 个窗口尺寸下的 12 个浏览器用例。
Playwright 管理自己的 `127.0.0.1:3210` 服务，不复用已有进程；应用截图与
失败记录保存在 `test-results/`。`npm run start` 使用刚才生成的生产构建，
监听 `127.0.0.1:3000`。运行服务不代表发布。

也可按计划中的命令合同分步运行 `npm run verify:offline`（类型检查与构建），
然后运行 `npm run verify:e2e`（浏览器考题，需前一步的构建）。T01 尚无独立
单元测试；现有行为考题全部由浏览器运行，不以零测试套件宣称通过。

干净环境复现：在新的项目副本中先执行以上两个 `npm ci`，再执行验证命令。
依赖下载需要 npm registry；安装后页面和考题不需要外部服务、在线字体或密钥。
两个 lockfile 分别固定应用与测试依赖；不要以安装到最新版本替代 `npm ci`。

目前的 320×740、390×844、1280×800 检查使用桌面 Chrome 模拟窗口。
不等同于 iOS Safari、Android Chrome 或微信真机验收。保护层的实际证据见
`docs/setup-status.md`，当前任务以 `tasks.md` 和真实代存档回执为准。

入口采用系统字体、白底、深绿色和原生 SVG 图标；本轮不生成图像或调用产品模型。
