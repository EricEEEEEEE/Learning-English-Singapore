# 聚会课程材料修订实测

2026-09-30，课程39197644-9f3b-47bd-af09-559cf28e35b5，源课程版本1，材料版本1。

通过正式saveLearningMaterials保存修订稿，再用新store实例读取：5条词组、10句中文释义。原任务、原课程及媒体描述逐项深比较一致；任务列表显示材料版本1。providerCalls和reservedMicros增量均0。未直接修改SQLite，未读取供应商API密钥，未发起生成。

词组五语来自party-learning-materials-review.md草稿；十句中文更新，其他四语整句保留原译文。所有辅助语言仍未经母语审查，不称语义验收完成。

实际Next页面使用已保存course-materials-1.json及既有party-first-person.mp4验证，1440×900、DPR2。浏览器路由供应本地保存内容与合成登录：5词组显示、10句材料及修订中文读取、提示回答可见、回视频实际播放均通过；课程读取1次、生成提交0次。已目视检查词组截图。

证据位于outputs/t61-party-multi：materials-save-check.json、materials-ui-check.json、materials-phrases.png、materials-sentences.png、save-materials.mjs、check-materials-ui.mjs。源媒体及原版course.json保留。

边界：这是实际存储读取与实际组件展示的分层验证，浏览器传输被本地路由替代；不是普通Google账号经真实HTTP到数据库的完整端到端验收，也不是公网发布。任务仍为本地合成身份。当前仍为34秒短课和四页学习，不代表5–8分钟课程或第五步自由语音已实现。

## 真实本地HTTP续验

在5be24951e3之后，新增本地HTTP验证器，直接使用仓库handleGenerationTasks、handleGeneratedCourse、handleGeneratedMedia及session GET处理器，依赖指向原实际课程存储。UI资源代理现有本地Next构建，不使用Playwright路由拦截。浏览器使用合成身份的有效签名cookie。

实际HTTP任务列表提供材料版本1，列表打开后5词组、修订中文句子、提示回复均可见，原视频开始播放；媒体Range返回206。另一合成账号读取课程404，匿名401。生成/写入请求0，费用0。证据materials-http-check.json、materials-http-phrases.png、check-materials-http.mjs位于同一outputs目录。

本次补齐网络传输和原接口处理器到实际数据库的验证；使用验证器注入本地存储位置，未测试Next configured包装器的默认tmp路径，亦未模拟普通Google登录。不能宣称实际Google用户已拥有此课程或公网已可用。
