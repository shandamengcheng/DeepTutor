# DeepTutor 工程文档

本目录记录当前 checkout 的实现架构，而不是产品路线图。文档中的“功能”按用户可识别、可独立配置或部署的产品域划分；内部帮助函数不会被误当成产品功能。

## 阅读入口

- [系统架构](architecture/system-architecture.md)：系统边界、组件关系、运行时约束与数据归属。
- [功能覆盖矩阵](features/README.md)：每项已实现功能到其完整说明的索引。

## 事实来源与维护约定

- Capability 的名称、阶段和工具契约以 `deeptutor/runtime/bootstrap/builtin_capabilities.py` 为准。
- 工具的注册目录以 `deeptutor/tools/builtin_specs.py` 为准；工具是否会在某个会话中出现还受上下文、权限和配置限制。
- HTTP/WS 接口挂载以 `deeptutor/api/main.py` 为准；前端页面不是接口权限的替代说明。
- 可持久化运行时配置位于 `data/user/settings/*.json`。根目录 `.env` 不作为产品配置源。

更新功能时，先修改对应功能文档；若加入新的 Capability、入口点或持久化边界，同时更新本索引和架构图。
