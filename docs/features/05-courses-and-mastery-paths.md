# 课程与掌握路径

## 目标与范围

课程面用于组织学习单元、材料和推荐动作；掌握路径面用于以知识点、评测和复习状态驱动个性化练习。二者可互相交接，但拥有不同的数据模型和 API。

## Course Study

`course_study` Capability 用于感知课程学习状态、推荐下一步并交接到合适的学习表面。它声明的工具包括 `course_overview`、`course_material`、`course_edit`、`course_handoff`，以及在允许时挂载的检索/搜索/执行/推理工具。API 为 `deeptutor/api/routers/courses.py`，领域实现为 `deeptutor/learning/`，前端在 `web/app/(utility)/courses/`。

课程资源、syllabus、状态和建议属于可持久化学习状态；Capability 建议不是替代资源实际存在性和用户权限的证明。

## Mastery Path

`mastery_path` Capability 使用 chat agent loop，但额外挂接硬性、按题型的掌握门槛与间隔复习。它使用 status、quiz、grade、skip、assess、build、paths、switch、leave 等 mastery 工具，并可使用已附着来源、RAG 和追问工具。API 位于 `deeptutor/api/routers/mastery_path.py`，领域实现位于 `deeptutor/capabilities/mastery/` 和 `deeptutor/learning/`，前端在 `web/app/(utility)/mastery/`。

## 核心边界

| 关注点 | Course Study | Mastery Path |
| --- | --- | --- |
| 主对象 | 课程、单元、材料、学习状态 | 路径、知识点、目标、问题、掌握与复习事件 |
| 主要动作 | 浏览、编辑、选取下一步、交接 | 建立/切换路径、出题、作答、判定、跳过、复习 |
| 真实完成证据 | 课程/材料/状态读回 | 题目判定与 progress/event 读回 |
| 入口 | `/api/courses` | `/api/mastery-paths` 与 WS |

## 约束与验收

- 路径和课程状态由用户 scope 隔离；不能根据前端 path id 越权读取。
- 题目“生成”与掌握“达成”是不同结果：后者必须由评分、事件和 progress 读回支持。
- Course handoff 必须引用存在且可访问的课程/学习面，不能只输出一个 UI 链接。
- 新增题型时要明确 mastery gate 的判定规则、跳过语义和复习调度，而不只新增展示组件。
