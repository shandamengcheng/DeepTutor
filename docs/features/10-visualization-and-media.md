# 可视化、数学动画与媒体生成

## 目标与范围

该域生成可交付的图表、交互式可视化、数学动画/分镜，以及图片、视频和语音相关内容。它的成功标准是可读取/可渲染的产物，不是模型声称已经生成。

## Visualize

`visualize` Capability 的静态阶段包括 `analyzing`、`generating`、`reviewing`，并可在选择 Manim 类型时采用概念分析、设计、代码、重试、总结和渲染阶段。可视化协议/注册和存储位于 `deeptutor/visualizers/`，API 位于 `deeptutor/api/routers/visualizers.py`，前端组件位于 `web/components/visualize/`。`submit_visualization` 是对可视化提交的工具边界。

## Math Animator

`math_animator` 生成 Manim 数学动画或 storyboard，阶段为 `concept_analysis`、`concept_design`、`code_generation`、`code_retry`、`summary`、`render_output`。实现位于 `deeptutor/agents/math_animator/`。该 Capability 只有在 `manim` 可导入时才被标为可用；缺少可选依赖时应返回安装提示而不是伪造视频。

## 图片、视频与语音

- `imagegen`、`videogen` 是工具级媒体生成能力，依赖相应 provider/配置。
- Voice API 在 `deeptutor/api/routers/voice.py`，实现位于 `deeptutor/services/voice/`。
- Media 输出经 outputs/文件边界提供；API 成功和任务创建不代表媒体文件已经落盘或可播放。

## 产物与验收

| 产物类型 | 必要验证 |
| --- | --- |
| SVG/HTML/图表 | schema/安全校验、持久化 manifest、浏览器或渲染读回 |
| Manim 视频/图片 | 渲染进程结果、输出文件存在且可读取 |
| 图片/视频 provider 输出 | provider 返回、文件下载/保存、实际预览或元数据读回 |
| 语音 | 编码/时长/文件或流的可用性读回 |

所有媒体生成都应受用户配置、费用和外部 provider 可用性约束。生成型输出必须明确来源和失败状态，不能将空 output URL 当作交付。
