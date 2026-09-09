# 接口、会话与运行运维

## 对外接口

| 入口 | 主要用途 | 实现 |
| --- | --- | --- |
| Web | 学习工作区与管理页面 | `web/` Next.js，按 feature/component 分层 |
| REST | CRUD、配置、资源管理、状态查询 | `deeptutor/api/main.py` 挂载的 routers |
| WebSocket | 统一回合流、KB/Book/题目/掌握路径/伙伴等实时通道 | `unified_ws.py` 及专属 WS routers |
| CLI | 交互 chat、run、KB、memory、notebook、partner、skill、plugin、config、session、book、doctor/init | `deeptutor_cli/` |
| Python SDK | 程序化启动/订阅/控制回合及操作 notebook | `deeptutor/app/facade.py` |

## 会话与回合

Session 代表可续接的对话/学习上下文；Turn 代表一次可流式、可取消、可恢复的执行。`TurnApplicationService` 管理 start/stream/cancel/reply/regenerate，`TurnRuntimeManager` 承担执行归属和重连，`StreamBus` 承担单轮事件重放。Sessions API 位于 `routers/sessions.py`，SDK 也提供会话列表、读取、改名、删除和活动回合查询。

客户端应把 stream 的 `DONE` 及其 status 视为完成依据；单个 HTTP 202、WS 连接建立、任务显示 active 或部分 content 都不能独立证明交付成功。

## 生命周期与后台服务

FastAPI lifespan 中执行配置一致性校验、构建并启动 ApplicationContainer、安装知识库进度端口、执行迁移，并尽力启动 EventBus、Partner 自动启动、Cron 和 GitHub sync 等服务。关闭时负责停止相应服务和运行时。后台工作使用自身状态/日志流；它不应挤占或伪装为聊天 StreamBus 的成功事件。

## 运维关注点

- Health/readiness：应用容器的协调后端健康检查失败时应拒绝启动；provider 初始化可用性需另行观测。
- 日志：保留请求/任务关联信息，过滤 secrets；WebSocket 连接抖动日志被降噪不等于忽略业务错误。
- 数据迁移：启动期迁移应可报告导入、跳过和归档结果；重要迁移应先备份并读回。
- 多 worker：使用 Redis coordination 时需验证 lease、recovery 和 retention；单机内存协调不提供跨进程共享语义。

## 端到端验收清单

- 用 Web、CLI、SDK 三种入口各完成一个同能力回合，并检查一致的成功/失败事件语义。
- 断开并按 `after_seq` 重订阅，确认流不重复且不会遗漏已保留事件。
- 取消一个活跃回合并确认最终状态、资源释放和后续同 session 回合可用。
- 对后台任务、导入、生成文件和外部同步，检查实际产物/外部状态 readback，而非仅检查启动日志。
