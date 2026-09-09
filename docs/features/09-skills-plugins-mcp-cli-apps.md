# Skills、Plugins、MCP、CLI Apps 与 Cron

## 目标与范围

这是 DeepTutor 的扩展层：Skills 向模型提供可发现的工作说明；Plugins 向运行时注册工具或 Capability；MCP/CLI Apps 提供外部工具；Cron 负责受控的定时工作。扩展存在于注册表中不等于每个用户、每个回合都被授权或挂载。

## Skills

Skills API 在 `deeptutor/api/routers/skills.py`，服务在 `deeptutor/services/skill/`，CLI 为 `deeptutor skill`。会话以 `skills_manifest` 公开可见 skill 摘要，模型再经 `read_skill` 按需加载正文。安装来自社区/Hub 的 skill 需要经过安全和来源边界，不能把远程说明直接当作可信可执行代码。

## Plugins

Plugins 位于 `deeptutor/plugins/`。CapabilityRegistry 在启动时加载内建目录并发现 plugins；ToolRegistry 使用懒描述符加载内建工具。插件必须提供可验证的 manifest/类契约，且不得与内建名称产生未定义覆盖。`deeptutor plugin` 提供 CLI 浏览入口。

## MCP 与 CLI Apps

MCP 配置 API 位于 `mcp_settings.py` 和 `space_mcp.py`，实现位于 `deeptutor/services/mcp/`；CLI Apps 的 API 位于 `space_cli_apps.py`，实现位于 `deeptutor/services/cli_apps/`。用户可见的目录、授权的可用项和管理员可安装项是不同集合。凭据应驻留在服务端的配置/凭据边界，绝不写入 prompt、日志或 skill 包。

## Cron

`cron` 是内建工具，服务位于 `deeptutor/services/cron/`，应用生命周期负责启动/停止 cron service。计划任务的“已注册”与“已执行成功”不同：每次运行必须有任务事件、产物或外部 readback。

## 验收清单

- Plugin 的 Capability/tool manifest 与注册表匹配；启动期 consistency 校验无 drift。
- Skill 在用户可见 manifest 中出现后仍需按需读取；不可见或未授权 Skill 不应被工具绕过读取。
- MCP/CLI App 的网络、凭据、允许的命令和用户权限分别验证。
- Cron 以实际运行记录和交付物验收，失败状态可定位和重试。
