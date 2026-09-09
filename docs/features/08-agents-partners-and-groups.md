# 本地 Agent、Partners 与伙伴组

## 目标与范围

DeepTutor 支持两类协作执行者：本地/远程 Agent harness（Subagent）和可长期配置、可接入 IM channel 的 Partner。它们都可能参与聊天，但拥有独立的身份、技能、记忆和授权规则。

## Subagent

Subagent 配置、连接和状态 API 位于 `deeptutor/api/routers/subagents.py`，服务位于 `deeptutor/services/subagent/`。当前回合选择本地 Agent 时，编排器会在 Capability 内部逻辑之前尝试 `run_direct_subagent`；这是一种明确的模型选择，而不是让普通 chat loop 再额外“猜测”是否转发。相关 Capability/工具位于 `deeptutor/capabilities/subagent/`。

Subagent 的可访问环境、模型、工作区和授权必须由服务端配置决定。前端选择名称不是允许任意 shell、文件系统或第三方账户访问的凭据。

## Partners

Partner 是可创建/管理/分配的协作身份，可有自己的 persona、library、skills 和私有 memory，并可通过聊天或 IM channel 运行。HTTP/WS adapter 位于 `deeptutor/api/routers/partners.py`，运行时和 channel 管理位于 `deeptutor/partners/` 与 `deeptutor/services/partners/`。伙伴的管理权限与使用权限不同；在多用户模式中应由资源访问检查决定，而不是一刀切只靠前端隐藏按钮。

## Partner Groups

Partner group 管理协作成员和组内交互，API 位于 `partner_groups.py`，Capability/工具位于 `deeptutor/capabilities/partner_group/`。`invoke_other` 应在受控的 group 语境内使用，避免通过任意名字横向调用不属于该组/用户的伙伴。

## 验收清单

- Subagent 选中后，回合的输出/错误明确标记来源；未连接时不会悄悄退化为错误模型。
- Partner 的会话、memory 和可见资源按所有者/被分配者隔离。
- IM channel 启停状态以实际 channel runtime/readback 为准，不把配置保存成功当作已连通。
- 伙伴组成员变更后，从服务端列表读回并验证调用授权。
