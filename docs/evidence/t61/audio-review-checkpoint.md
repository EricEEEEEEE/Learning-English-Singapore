# T61B 音轨确认记录检查点

红档 e35cbc7225 后新增内部 confirmEncodedAudio，仅 simulation 模式。验证会话归属、课程版本、段序号、编码和源哈希，重新读取私有AAC并核对实际字节，再事务核对音轨快照，写入版本、哈希及确认时间。同一音轨重复确认复用原记录，不增加费用或生成调用。

3项新题及全部T61B领域共206项通过，typecheck/diff通过。日志 `.loopwork/logs/t61b-audio-review-green.log`、`t61b-audio-review-typecheck.log`。本轮未运行完整verify。

只读静态审查无阻断。该记录仅证明调用方提交确认，不能证明真人已听审；没有对实际用户音轨自动确认。now为内部可注入测试时间，未来HTTP入口必须使用服务端时间。runVideo尚未使用此记录，不是已生效的生产听审闸门。没有新增HTTP确认入口、上传或收费请求。
