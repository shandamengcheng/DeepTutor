# 知识库与 RAG

## 目标与范围

知识库将本地文件、外部来源或连接器中的材料变成受名称和用户权限约束的可检索资源。RAG 是在已附着知识库内检索并返回带来源的内容，不是一个绕过访问控制的全局文件搜索。

## 功能面

- 创建、列举、查看、配置、删除和重建知识库。
- 上传文件、创建文件夹、移动/移除文件、预览已解析文本、查看进度与失败重试。
- 选择解析引擎，并选择/配置 RAG pipeline。
- 连接文件夹、Obsidian、MarginNote 4、IMA、WeKnora、LightRAG Server、GitHub 等外部知识来源（具体可用性取决于部署配置）。
- 在会话中附着 KB；`rag` 返回检索内容和原始 provenance，`kb_files` 返回库存而非猜测检索结果。

## 组件和数据边界

| 层 | 责任 | 代码位置 |
| --- | --- | --- |
| HTTP/WS | 知识库管理、上传、进度推送与连接器配置 | `deeptutor/api/routers/knowledge.py` |
| 领域模型 | KB manifest、文档库存、可访问性解析 | `deeptutor/knowledge/` |
| 解析 | 文本/Office/PDF 等抽取和可替换解析引擎 | `deeptutor/services/parsing/` |
| RAG | LlamaIndex、PageIndex、GraphRAG、LightRAG 等 pipeline 适配 | `deeptutor/services/rag/` |
| 会话工具 | `rag`、`kb_files`，以及 `read_source` | `deeptutor/tools/builtin/` |
| 权限 | 由当前用户 scope 解析可用 KB 与 manifest | `deeptutor/multi_user/knowledge_access.py` |

## 输入与输出

- 管理输入：KB 名称、文件/文件夹、引擎配置、外部连接参数或重建请求。
- 会话输入：显式 `kb_name` 和非空查询。RAG 不接受“自动猜一个库”的调用。
- 会话输出：答案/片段及 `sources`。可用 provenance 时包含文档、页码、chunk/entity/report 等；引擎未给 provenance 时才保留最小查询回显。
- 进度输出：索引/解析进度走知识库 WebSocket，不与聊天回合 StreamBus 混为同一协议。

## 配置与约束

- 文档解析活跃引擎和每个引擎配置保存于运行时 settings；默认 text-only，重型本地模型下载必须经对应开关允许。
- PageIndex、嵌入和外部服务需各自的有效配置。编排器会在回合开始前校验 PageIndex OSS 选择，错误会作为终态回合错误返回。
- 文件列表、预览和检索都必须在当前用户有权访问的 KB 内执行；前端传来的名字不是权限证明。
- 索引成功只表示索引链路完成。应另以实际查询和来源 readback 验收“材料可被正确引用”。

## 验收清单

- 上传后可从文件列表、解析预览和索引状态读取实际结果。
- 用明确 KB 名称的 RAG 查询能返回来源，不跨越未授权库。
- 失败文件可定位、重试或单独移除，不要求销毁整个 KB。
- 修改 pipeline/解析配置后，以重新索引和真实检索验证，不只检查 HTTP 200。
