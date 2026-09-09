# 出题、题库与测评

## 目标与范围

该域生成、保存、组织和评判学习题目。它涵盖独立的 `deep_question` 能力、题库、题目与 Notebook 的关联，以及 WebSocket AI 判题；掌握路径中的测验复用这些基础能力，但其路径状态在 [课程与掌握路径](05-courses-and-mastery-paths.md) 中定义。

## 功能组成

| 功能 | 责任 | 实现入口 |
| --- | --- | --- |
| Deep Question | 模板批次到生成的两阶段题目生成 | `deeptutor/agents/question/`、`routers/question.py` |
| Question Bank | 分类、筛选、查询及与其它学习资产关联 | `QuestionBankTool`、`routers/question_notebook.py` |
| AI Judge | 通过专用 WebSocket 对答案进行判定 | `routers/quiz_judge.py` |
| 课程/Book 测验 | 将题目尝试写入相应学习状态 | course/book/mastery 服务 |

## 输入与输出

- 出题输入可以包含主题、模板/约束、KB、搜索或代码执行上下文。`deep_question` 的对外阶段为 `ideation` 和 `generation`。
- 题库输出是可持久化题目记录和过滤结果；不应把模型聊天文本当成已入库题目。
- 判题输入必须关联具体题目、答案和用户 scope；输出应区分解析/模型故障、未判定与实际的评分/反馈。

## 质量与安全边界

- 题目引用知识库或网页时，保留可核对的来源。没有材料时应标注为模型生成，不假称“来自教材”。
- 选择题、自由回答和其它题型需在 schema、前端渲染和评测端一致；题型兼容性不能仅在 prompt 中约定。
- AI 判题是学习反馈机制，不是高风险考试认证；部署方如需正式考试，应另加身份、审计、人工复核和防作弊边界。

## 验收清单

- 生成的题目可在题库/关联页面读回，字段和题型完整。
- 评测 WebSocket 的最终结果能与对应 question/attempt 匹配，不串用户或串题。
- 失败/中断时不会把部分生成文本写成完整可用题。
