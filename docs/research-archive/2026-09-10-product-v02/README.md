# Learning English in Singapore · v0.2

本轮升级第一份核心产品规格，落实2026-09-10最新需求；没有开始应用开发。

- 主文档：[spec.md](</Users/eric/projects/Learning English  Singapore/spec.md>)。
- 阅读版：`output/pdf/singapore-english-product-spec-v02.pdf`，42页。
- 来源：`sources.json`合并73项，`new-sources.json`为新增34项；原始查询和读取结果存于`raw/`。同机构多页不是独立验证；来源数量不是受访人数。
- 审查：`REVIEW.md`记录独立评审、修订和仍待验证的边界；`document-qa.json / pdf-qa.json`记录最终一致性检查。
- 前版：`spec-v01-archived.md`保留升级前快照，原v0.1 PDF和两份痛点报告不修改。

新增内容：听第一、说第二；自然选择式问答与暂定分级；AI主动开场和沉默引导；统一尊重口音与方言的产品规范；36个有资料依据的场景种子与6个设计样例；8类视觉路线及分段速度验收；OpenAI语音与生成式视频的接口、双人输出及数据边界。

所有性能阈值为候选目标。Runway Characters、Simli和LTX-2.5 Fast为验证候选，并非已购买或实测通过。不存在全市场最快的已证实排名。

复现：先运行`upgrade_spec.py`生成规格和来源索引，再使用Codex bundled Python运行`build_spec_pdf.py`与`render_review.py`。重新生成会将QA审查状态恢复为pending；必须重新核对最终产物，不沿用旧的通过状态。
