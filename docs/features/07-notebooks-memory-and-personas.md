# 笔记、记忆与 Persona

## 目标与范围

该域保存学习者可回看的材料与可解释的个性化上下文。Notebook 是显式记录容器；Memory 是模型可在后续轮次注入/检索的分层信息；Persona 是本轮从首 token 起生效的表达和行为指令。三者有关联，但不是同一个数据表或权限概念。

## Notebook

Notebook 支持创建、列举、读取、添加、更新、删除记录，以及以引用集合在会话中读取记录。SDK facade 公开对应方法，HTTP API 在 `deeptutor/api/routers/notebook.py`，服务位于 `deeptutor/services/notebook/`。会话可通过 `list_notebook` 与 `write_note` 工具使用它。

## Memory

Memory 提供 L1 trace、L2 surface summary、L3 synthesis 和图谱/溯源浏览。API 在 `deeptutor/api/routers/memory.py`，实现位于 `deeptutor/services/memory/`，Web 页面在 `web/app/(utility)/memory/`。`read_memory`、`write_memory` 是工具级入口；写入必须服从策略和当前用户 scope，不能把任意聊天内容无条件持久化为长期事实。

## Persona

Persona 用于注入选定角色的系统指令。`UnifiedContext.persona_context` 是与 user message 一同送入能力的高优先级上下文，API 位于 `deeptutor/api/routers/personas.py`。Persona 影响回答方式，不赋予额外工具、文件或用户权限。

## 数据边界与验收

| 对象 | 可见性/归属 | 成功证据 |
| --- | --- | --- |
| Notebook record | 当前用户的 notebook | 记录和引用读回 |
| Memory entry/surface | 当前用户的 memory scope | L1/L2/L3/graph 端点读回并显示来源 |
| Persona | 当前用户或被授权的配置 | 选中状态和实际 context 注入可验证 |

- “模型提到过”不等于 Memory 已写入；应检查写入结果及后续读取。
- L3 综合结论应能追溯到 L2/L1 依据；无法追溯时应标明为总结性内容。
- 删除/编辑操作必须作用于精确资源 id，并验证未影响其它用户 scope。
