# 统一会话与 AI Capability

## 目标与范围

这是所有交互式 AI 回合的共同入口。它负责将会话输入标准化为 `UnifiedContext`，选择一个接管本轮的 Capability，流式返回状态/内容/工具证据，并保存可恢复的会话状态。它不负责把每个 Capability 的领域逻辑塞进 API router。

## 用户入口

- Web：`/chat` 与 `/chat/[sessionId]`，经统一 WebSocket 路由提交/订阅回合。
- CLI：`deeptutor chat`（REPL）和 `deeptutor run <capability> <message>`。
- SDK：`DeepTutorApp.start_turn()`、`stream_turn()`、`cancel_turn()`、`submit_user_reply()`。
- 伙伴与其它适配器：复用 SDK/应用容器，而不是自行调用某个 LLM provider。

## 架构组成

| 组件 | 责任 | 代码位置 |
| --- | --- | --- |
| `UnifiedContext` | 本轮用户消息、历史、附件、KB、工具限制、语言、Persona/Memory/Skills 上下文和扩展状态 | `deeptutor/core/context.py` |
| `ChatOrchestrator` | 默认选 `chat`，或按 `active_capability` 路由；标准化失败和完成事件 | `deeptutor/runtime/orchestrator.py` |
| `CapabilityRegistry` | 懒加载内建/插件 Capability，并公开 manifest | `deeptutor/runtime/registry/capability_registry.py` |
| `ToolRegistry` | 以描述符懒加载工具、处理别名并产生 OpenAI tool schema | `deeptutor/runtime/registry/tool_registry.py` |
| `StreamBus` | 一轮内的订阅、历史回放、输入暂停和事件扇出 | `deeptutor/runtime/stream_bus.py` |
| Turn runtime | 回合启动、流重连、取消、用户回复、恢复和 session 持久化 | `deeptutor/services/session/`、`deeptutor/app/` |

## 内建 Capability 契约

| Capability | 用途 | 静态阶段 | 主要专属能力 |
| --- | --- | --- | --- |
| `chat` | 默认的工具增强对话 | exploring, responding | 通用 Agentic loop；可挂载上下文工具 |
| `ask_questions` | 在信息不足时向用户追问并继续原任务 | responding | `ask_user` 暂停/恢复契约 |
| `deep_solve` | 多步问题求解 | responding | solve plan/finish/replan，代码执行与检索 |
| `deep_question` | 批量/模板化生成题目 | ideation, generation | RAG、搜索、代码执行 |
| `deep_research` | 迭代型研究报告 | rephrasing, decomposing, researching, reporting | RAG、网页/论文检索、代码执行 |

其余学习/媒体 Capability 见对应功能文档。上表阶段来自内建 manifest，表示对外流状态，不应被解释为所有内部函数的时序图。

## 工具挂载规则

工具分为用户显式启用的可选工具（如 `brainstorm`、`web_search`、`paper_search`、`reason`）和由会话条件自动挂载的工具。自动挂载可受附件、知识库、沙箱、技能、伙伴所有者策略和 `allowed_builtin_tools` 白名单限制；`enabled_tools=[]` 与未指定的语义不同。工具注册清单见 `deeptutor/tools/builtin_specs.py`，Capability manifest 中的 `tools_used` 是能力契约而不是无条件执行保证。

## 输入、输出与失败语义

- 输入：消息、可选 session id、能力名、工具、KB、附件、语言、配置覆盖、notebook/history 引用。
- 输出：`SESSION`、阶段、文本、工具调用/结果、来源、结构化结果、错误和 `DONE` 等 `StreamEvent`。事件应携带 source/stage/metadata，供所有入口一致消费。
- 失败：未知 Capability、PageIndex 配置校验或 Capability 异常会产生终态错误事件；编排器仍关闭流并发布完成事件。客户端不应把连接关闭误判为成功。
- 暂停：`ask_user` 通过 `WAIT_FOR_INPUT` 等待回复；回复必须投递到同一 turn id。

## 状态与安全边界

会话/回合持久化由 session 服务按当前用户 scope 管理。`runtime` 是不可序列化的私有依赖；扩展的可变状态应放在 `extension_state[namespace]`。Capability 不能信任客户端伪造的完成状态、权限或另一个用户的会话 scope。

## 验收清单

- `deeptutor run chat "..."` 与 WebSocket 都能得到同一事件类型契约。
- 未指定 Capability 时默认 `chat`；未知名称返回可读的终态错误。
- 取消、重连订阅、追问回复和 regenerate 不会产生重复/丢失的终态事件。
- 新增 manifest 后，启动期工具一致性校验通过。
