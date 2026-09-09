# 模型、Provider 与运行设置

## 目标与范围

平台设置集中管理 LLM、embedding、搜索、解析、RAG、网络、沙箱、端口和集成协调配置。它的目标是让 API、CLI、SDK 与后台服务读取同一份运行时事实，而不是从项目根 `.env` 或前端状态各自推断。

## 配置存储与加载

运行设置服务位于 `deeptutor/services/config/runtime_settings.py`，配置默认写入 `data/user/settings/*.json`，并可被受支持的进程环境覆盖。`ensure_runtime_settings_files()` 在应用加载时建立配置文件，`export_runtime_settings_to_env()` 使下游 provider 能读取当前配置。

主要配置类别包括：

- system：端口、CORS、TLS 验证、附件上限、能力自动路由、sandbox subprocess 开关；
- auth：是否开启认证、管理员账户、cookie 与会话策略；
- integrations：PocketBase、turn coordination（内存或 Redis）、外部服务；
- model/provider：LLM、embedding、搜索、图片/视频/语音 provider 与 OAuth；
- document parsing：text-only、MinerU、Docling、MarkItDown、PyMuPDF4LLM、LiteParse、Tika 等可选引擎；
- RAG/连接器：PageIndex、LightRAG、IMA、WeKnora、MCP 等各自配置。

## 管理接口

Settings API 在 `deeptutor/api/routers/settings.py`，模型/agent 配置相关路由包括 `agent_config.py` 和 provider CLI。`deeptutor init` 用于首次设置，`deeptutor config`、`deeptutor provider` 和 `deeptutor doctor` 用于检查/管理。前端 Settings 是配置 UI，不是唯一的配置消费者。

## 安全与运维约束

- API key、OAuth token、MCP 凭据和管理员秘密不可出现在文档、模型上下文、前端 bundle 或日志中。
- `disable_ssl_verify`、宽松 CORS、host-side sandbox 是部署级风险开关，应由部署者明确配置并在生产环境复核。
- 文档解析器和媒体/检索服务可能依赖额外二进制、模型或远端端点；“配置已保存”并不代表依赖已安装或网络已可达。
- Provider 选型必须按模型能力（如 tool calling、embedding、媒体）校验，不能把一个 OpenAI-compatible endpoint 自动视为支持所有能力。

## 验收清单

- 设置变更从服务端读回，且新回合实际读取到目标配置。
- `deeptutor doctor` 或等价健康检查验证凭据/端点/依赖时，不泄露秘密。
- 切换解析或 RAG 引擎后，用真实导入和检索验证。
- Redis coordination 配置时，应用容器健康检查通过；不可用时拒绝启动，而非静默降级为多个不一致的运行时。
