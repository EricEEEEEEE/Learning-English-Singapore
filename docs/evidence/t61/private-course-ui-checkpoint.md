# T61B 私有课程四页入口检查点

红档 f005423e15 后，生成任务列表对 video_assembled 且版本有效的任务显示课程入口。现有四页播放器可读取私有课程，严格核对课程及逐句版本，复用学习材料校验，并从本地 ID/版本构造视频 URL。读取失败不回退到公共样片；退出停止播放，重开重新加载。五种辅助语言均提供保存课程文案，模拟材料仍标注为测试。

新增两项浏览器用例在 desktop、phone、small-phone 三视口共 6 项通过，包含真实 video 元素播放、词句翻译展示、四页切换、重复打开不 POST 生成及 401 拒绝。接口响应由测试替身提供，媒体是既有酒店样片，不能认作新生成课程或真实鉴权 HTTP 验收。构建和 diff 检查通过。

只读静态审查无阻断。尚需真实 HTTP 会话与媒体端到端、拖动播放及会话途中失效验证；前端内部将 ai-generated 映射到旧 ai-sample 契约用于兼容校验，后续扩展来源展示时须保留区别。没有录音、评分或自由对话，没有新收费调用或部署。

日志：`.loopwork/logs/t61b-private-course-green.log`、`t61b-private-course-build.log`、`t61b-private-course-regression.log`。本轮未运行完整 verify。
