# 沉浸式阅读与观看

## 目标与范围

该域将材料/视频与导师放在同一学习上下文中。它强调定位、引用和学习进度，而不是将全文或视频摘要一次性塞进普通对话。

## Immersive Reading

`immersive_reading` Capability 的对外阶段为 `responding`。它提供材料标签页、目录、检索、分段读取、跳转与批注等工具：`reading_list_tabs`、`reading_switch_tab`、`material_outline`、`search_material`、`read_material`、`reader_goto`、`reader_annotate`；可按能力契约配合搜索、代码执行和推理工具。

阅读资源、工作区和目录由 `deeptutor/reading/` 管理，HTTP API 在 `deeptutor/api/routers/reading.py`，扩展入口在 `reading_extensions.py`，前端页面在 `web/app/(workspace)/reading/`。回答应以实际页码/章节或材料定位为依据；没有可定位来源时不能伪造“逐页引用”。

## Immersive Watching

`immersive_watching` Capability 面向 YouTube 学习，向模型提供时间戳约束下的上下文；产品 API 位于 `deeptutor/api/routers/video_learning.py`，领域模块位于 `deeptutor/video_learning/`，Web 页面为 `web/app/(workspace)/whisper/` 及相关组件。播放方式和外部视频服务属于可选部署配置，文档不假定所有环境均具备某一第三方服务。

## 边界与数据

| 项目 | 阅读 | 观看 |
| --- | --- | --- |
| 学习对象 | 已导入材料/阅读工作区 | 视频 URL、字幕与时间点上下文 |
| 可验证定位 | 页、段、目录、批注 | 时间戳、字幕片段、播放进度 |
| Capability | `immersive_reading` | `immersive_watching` |
| 领域实现 | `deeptutor/reading/` | `deeptutor/video_learning/` |
| 权限 | 当前用户可访问的材料/工作区 | 当前用户的学习状态与允许的资源 |

## 验收清单

- 阅读助手的引用跳转到存在的材料位置，批注能读回。
- 切换标签/材料后，不把上一材料的定位错误归属到当前材料。
- 视频回答中的时间点可由字幕/时间轴核验；进度可恢复。
- 未配置视频服务或无可用材料时，明确返回能力限制而非假装已分析内容。
