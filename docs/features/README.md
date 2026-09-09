# 功能覆盖矩阵

“完整功能文档”在这里指一个用户可识别、具有独立入口/数据边界/配置边界的功能域。下表同时覆盖已注册的 11 个内建 Capability 和其支撑产品域。

| 功能域 | 覆盖的能力或界面 | 完整说明 |
| --- | --- | --- |
| 统一会话与 AI 能力 | `chat`、`ask_questions`、`deep_solve`、`deep_question`、`deep_research` | [01](01-conversation-and-capabilities.md) |
| 知识库与检索 | KB 创建、上传、解析、索引、RAG、外部库连接 | [02](02-knowledge-base-and-rag.md) |
| 图书与协作写作 | Books、Co-Writer、导入与附件 | [03](03-learning-content-books-and-co-writer.md) |
| 沉浸学习 | `immersive_reading`、`immersive_watching`、阅读扩展、视频学习 | [04](04-immersive-reading-and-watching.md) |
| 课程与掌握路径 | `course_study`、`mastery_path`、学习建议 | [05](05-courses-and-mastery-paths.md) |
| 出题与测评 | `deep_question`、题库、AI 判题、掌握度测验 | [06](06-questions-and-assessment.md) |
| 笔记与记忆 | Notebook、L1/L2/L3 Memory、Persona | [07](07-notebooks-memory-and-personas.md) |
| 本地 Agent 与伙伴 | subagent 直连、Partners、Partner Groups、IM channels | [08](08-agents-partners-and-groups.md) |
| 可扩展能力 | Skills、Plugins、MCP、CLI Apps、Cron | [09](09-skills-plugins-mcp-cli-apps.md) |
| 可视化和媒体 | `visualize`、`math_animator`、图片/视频/语音 | [10](10-visualization-and-media.md) |
| 模型与运行设置 | LLM/embedding/search、解析、sandbox、启动诊断 | [11](11-model-providers-and-settings.md) |
| 身份与多用户 | 登录、用户/管理员、资源授权、个人资料 | [12](12-identity-multiuser-and-access.md) |
| 接口与可运维性 | Web/REST/WS、CLI、SDK、session、后台任务、系统状态 | [13](13-interfaces-sessions-and-operations.md) |

未列为单独“功能”的项目（如文件输出、dashboard、设置导航）已被纳入其拥有的数据域或平台域，以免把技术页面与独立产品能力重复计数。
