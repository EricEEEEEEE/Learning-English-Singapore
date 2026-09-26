# T61B 编码音轨持久来源绑定

红档 bf68b21783 后在 generation-tasks 增加 encodeAudio，仅本地 simulation 模式。逐次从本人同任务原PCM分段读取并重算哈希/时长，调用可信本地编码器；核对编码结果的源哈希、源时长、AAC标记、解码结果、输出哈希及20秒上限，再保存私有素材，事务核对快照后登记引用。记录不包含音频字节，不增加provider计数或预留金额。

重开后核对已登记素材并复用，每次最多新增下一段。6项新增考题及全部T61B领域合计203项通过，typecheck/diff通过。日志 `.loopwork/logs/t61b-encoded-task-green.log`、`t61b-encoded-task-typecheck.log`。本轮未完整verify。

只读静态审查无阻断。并发调用可能重复本地编码，CAS避免覆盖冲突引用但可能留下未引用文件；真实格式可信度仍依赖编码器执行，不接受用户自报。当前runVideo仍读取旧PCM路径，尚未切换到编码素材和持久听审记录，不能将本次通过称为完整真实生成接通。无上传、无费用。
