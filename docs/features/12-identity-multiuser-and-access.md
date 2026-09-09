# 身份、多用户与访问控制

## 目标与范围

身份域将“谁在调用”绑定到用户 scope、会话、知识库、学习资产、伙伴和管理动作。它允许本地单用户模式保持低摩擦，同时在启用认证后避免资源仅凭客户端 id/路径被越权访问。

## 功能组成

| 功能 | 入口 | 职责 |
| --- | --- | --- |
| Auth | `routers/auth.py`、`/api/auth` | 登录、登出、注册、状态、profile、设备/OAuth 相关入口 |
| Multi-user | `routers/multi_user.py`、`deeptutor/multi_user/` | 用户、管理员资源、授权和用户路径 scope |
| Learning surface gate | `require_learning_surface` | 为受保护 HTTP 学习资源建立用户上下文 |
| Admin gate | `require_admin` | 限制系统级设置、管理和共享资源操作 |
| WebSocket auth | 各 WS handler 内 | 在 `accept` 前完成相应认证/身份解析 |

## 路由策略

`deeptutor/api/main.py` 将 auth 和 outputs 保持在公共或独立边界；多数 HTTP router 施加 `require_learning_surface`，管理员专属 router/动作使用 `require_admin`。WebSocket 不能复用 FastAPI 普通 Request dependency，因此在连接处理函数内部鉴权。这是实现差异，不是权限降低。

Partner、MCP、CLI Apps 等资源还可能有自己的“使用权”与“管理权”判定。正确的访问控制应由服务端根据当前身份和资源归属解析；前端隐藏入口只是体验层。

## 数据隔离与验收

- 所有持久化服务以 user scope 选择根目录/存储，切换用户后 session、notebook、memory、学习进度和受限 KB 不串联。
- 非管理员访问管理员资源被拒绝；管理员动作不依赖客户端传来 `role=admin`。
- WebSocket 未认证/过期认证在连接接受前失败，已认证连接不能订阅另一个用户的 turn id。
- Profile/avatar 等个人资料更新以对象读回和归属验证为准。
