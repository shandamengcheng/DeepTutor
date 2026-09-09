# 学习内容：Books、Co-Writer、导入与附件

## 目标与范围

该域处理可长期保存、可继续学习的内容资产：交互式 Book、协作写作草稿、聊天附件和外部聊天记录导入。它与“本轮回答”不同，核心是内容生命周期与资源引用。

## Books

Books 是由 Book Engine 管理的学习内容集合，支持库列表、创建、页面/块更新、页面聊天、学习捕获、访问/测验进度与 Markdown 导出。HTTP 和 WebSocket 适配位于 `deeptutor/api/routers/book.py`，领域实现位于 `deeptutor/book/`；命令行入口为 `deeptutor book`。

Book 的共享内容与学习者的私有学习状态应区分保存。页面聊天、进度与 captures 必须使用当前用户 scope，不能因为书本可共享就将个人状态泄露给所有读者。

## Co-Writer

Co-Writer 管理文档创建、编辑、流式编辑、模板/草稿和持久化 manifest。API 在 `deeptutor/api/routers/co_writer.py`，服务与存储在 `deeptutor/co_writer/`。文档编辑输出是内容资产，应该记录结构化结果与保存位置；仅生成一段流式文本不代表草稿已落盘。

## 附件与导入

- 附件通过 `/files/attachments` 处理，在会话中形成 `Attachment` 与 `source_manifest`，由 `read_source` 等工具按需读取。
- 系统配置限定单文件、总大小和可内联的文本字符预算；超出限制应在接收/解析边界拒绝，不靠模型自行遵守。
- Imports router 支持将外部聊天历史等内容导入可管理的本地资产。导入后必须从 session/asset 读回确认，而不是只记录上传成功。

## 关键接口与依赖

| 能力 | API adapter | 核心依赖 |
| --- | --- | --- |
| Books | `book.py`（HTTP + WS） | `deeptutor/book/`、session、输出文件 |
| Co-Writer | `co_writer.py` | `deeptutor/co_writer/`、notebook、附件 |
| 附件 | `attachments.py` | parsing、session、文件输出 |
| 导入 | `imports.py` | session/内容存储 |

## 验收清单

- 创建/修改/导入后能通过相应列表或详情接口读回资产及其归属。
- 页面聊天或流式编辑断线后不把未确认的临时输出写成已保存版本。
- 附件在引用会话范围内可读，未授权用户和路径穿越请求被拒绝。
- Book 导出、Co-Writer 保存等文件型交付以实际文件读回作为完成证据。
