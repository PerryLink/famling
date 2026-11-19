# 七个视角的全项目评审问题总清单（2026-11-19）

> 汇总自 `docs/research/PROJECT-REVIEW-*.md`。原文包含完整证据、行号、成本与验收；这里只做完整索引，不代表都已修复。

## 架构师
原文：`docs/research/PROJECT-REVIEW-ARCHITECT-2026-11-19.md`

### P0（3）
- P0-1 共享内容语义无单一权威源，已经漂移
- P0-2 dsh-famling 构建/发布不可自证（跨私有仓隐式依赖+无 git/CI）
- P0-3 发布信任与版本身份未闭环（DLC 生产根、Authenticode、updater、DesktopGames 元数据）

### P1（7）
- P1-1 DSH 宿主适配层/能力协商缺失，engines.dsh 不被宿主强制
- P1-2 远程市场/安装器缺系统设计，两产品能力不对称
- P1-3 Pet Brief/bridge/同意语义双实现
- P1-4 单体化与并行协作冲突
- P1-5 角色/动画多管线与遗留资产/遗留宿主
- P1-6 famling 公开镜像与私仓 CI 断链
- P1-7 Tauri 同源页面 storage 未隔离

### P2（10）
- P2-1 分层反向依赖（voice→pet/security）
- P2-2 遗留 Electron 宿主仍随仓/依赖
- P2-3 产品元数据仍是旧身份（DesktopGames/0.1.0/包名）
- P2-4 文档/测试数字漂移
- P2-5 插件 i18n 文案内联
- P2-6 发布页未收口（9 个入口/开发页随包）
- P2-7 插件客户端无类型检查/构建
- P2-8 契约文档多副本
- P2-9 本地构建产物占用工作区
- P2-10 合规元数据强度两端不一致

## 软件工程师
原文：`docs/research/PROJECT-REVIEW-SOFTWARE-2026-11-19.md`

### P0（1）
- P0-1 质量门不存在：无 remote、CI 从未运行、干净 checkout 必红

### P1（7）
- P1-1 main.ts 3555 行单体/35 个模块级可变状态/无行为测试
- P1-2 initContentHub 单函数约 1010 行
- P1-3 内容目录/校验器三份手写源已漂移
- P1-4 测试金字塔倒置/20 个静态源码断言/仓外依赖
- P1-5 插件纯 JS 无 typecheck/lint，host 桥接错误全吞
- P1-6 持久化状态散落（约 30 个 key）/无迁移/整页 reload
- P1-7 产物包含演示栈与旧 Electron/Pixi/Cordis，无 bundle 预算

### P2（7）
- P2-1 scripts 工具 sprawl / 生成器重复
- P2-2 文档漂移与体积膨胀
- P2-3 测试可移植性/Node 版本假设
- P2-4 具体错误处理缺陷（toISOString/request.text 等）
- P2-5 供应链/CI 细节（actions 未 pin、无 clippy/fmt）
- P2-6 插件构建不可从自身仓库重建
- P2-7 content-library.ts 4568 行/三代 schema 并存

## 网络工程师
原文：`docs/research/PROJECT-REVIEW-NETWORK-2026-11-19.md`

### P0（2）
- P0-1 生产 DLC 信任根为空 + 包仍 legacy 签名，release DLC 信任链不成立
- P0-2 分发/更新无可验证发布者身份（NotSigned/无 updater/SHA256SUMS 无外层签名）

### P1（7）
- P1-1 远程市场缺传输层与防回滚契约
- P1-2 CSP 与市场实现冲突，需受限 Rust 下载器
- P1-3 信任根生命周期/吊销传播/核心不校验注入信任根
- P1-4 云端出网（TTS/ASR/share）隐私/失败语义/响应无上限
- P1-5 dsh-famling bridge 纵深防御与限流依赖宿主
- P1-6 下载/解压/安装链路未实现，宿主解压边界未入契约
- P1-7 插件分发/更新不可信且版本漂移

### P2（12）
- P2-1 SSRF/主机允许列表
- P2-2 无镜像/CDN/缓存语义
- P2-3 限流/重试参数未定义
- P2-4 下载大小/时间/磁盘配额未定义
- P2-5 Sentry DSN 可通过 URL 参数注入
- P2-6 无导航白名单
- P2-7 隐私告知缺未来市场数据流
- P2-8 CI Actions 未按 SHA 固定
- P2-9 无发布物外层签名/清单
- P2-10 dirty tree/陈旧 dist 风险
- P2-11 出网实现细节（UA/rustls/connect timeout）
- P2-12 TTS 缓存/额度无上限

## 游戏工程师
原文：`docs/research/PROJECT-REVIEW-GAME-2026-11-19.md`

### P0（3）
- P0-1 内容市场/角色主题包无法交付可玩的新角色
- P0-2 发布构建 DLC 全失败（生产根空+旧签名）
- P0-3 玩法循环与产品形态未定义/未验证

### P1（8）
- P1-1 动画运行时双轨（调度器死代码 vs behavior/ambient）
- P1-2 计时表 6 处复制/per-character override 打破同构/无等价门禁
- P1-3 资产预算：baked WAV 4.2MB 无压缩/散帧 PNG/hero 全量预载
- P1-4 角色切换=整页 reload，不是即时切换
- P1-5 角色/动作数据 4 处复制
- P1-6 DLC 只能加数据、不能加美术/音频/场景；Steam entitlement stub
- P1-7 死 clip（walk/attack）与 human 眨眼收尾跳
- P1-8 多显示器 DPI 只读一次、无跨屏重配

### P2（9）
- P2-1 点击穿透 60ms 轮询/readback 回退
- P2-2 性能修复无复测；rAF 60Hz 常驻
- P2-3 human/cat 眨眼帧问题
- P2-4 插件懒加载只有 Node vm 仿真，无真实 GUI 网络证据
- P2-5 首屏预算回涨/内容层代码量大于动画运行时
- P2-6 文档/发布事实漂移
- P2-7 三套游戏时间尺度/离线存档语义不一致
- P2-8 30s 自动保存仍在 rAF 主线程/无 dirty-only
- P2-9 QA/tinglan 概念与多 actor 未产品化

## 测试工程师
原文：`docs/research/PROJECT-REVIEW-QA-2026-11-19.md`

### P0（3）
- P0-1 GUI/E2E 无数据隔离，可直接删/写真实存档
- P0-2 质量门从未运行；干净 checkout 必红；关键层不在 CI
- P0-3 坏档恢复/IPC 超时等数据链无行为回归；main.ts 不在测试/覆盖率

### P1（8）
- P1-1 发布证据不可机器复核（无 SHA256SUMS/MANIFEST/build-info）
- P1-2 插件发布闭环缺失/缺私有资产时 t.skip
- P1-3 真实 GUI/渲染无自动化；E2E 不可移植
- P1-4 故障注入面不足（ENOSPC/只读/锁/中途 kill/IPC 挂起）
- P1-5 覆盖率口径漏关键模块/静态断言伪覆盖
- P1-6 Rust/Tauri 验证不 gate
- P1-7 同源 localStorage/多窗口隔离未测
- P1-8 24h soak/性能/DPI 无当前 HEAD 证据

### P2（10）
- P2-1 文档数字/状态漂移无 commit 绑定
- P2-2 E2E 卫生：941 profile/12GB artifacts/固定 sleep/端口
- P2-3 无 lint/format/coverage 脚本
- P2-4 CI 顺序导致 dist/法律链接测试永久 skip
- P2-5 测试未按 fast/full/gui/perf 分层
- P2-6 插件纯 JS 无类型检查
- P2-7 静态源码断言维护成本高
- P2-8 无 property-based/mutation 测试
- P2-9 无 npm 发布/版本演练
- P2-10 性能/资源无回归基线

## 心理学家
原文：`docs/research/PROJECT-REVIEW-PSYCHOLOGY-2026-11-19.md`

### P0（3）
- P0-1 产品壳无静音/音量/暂停动效/暂时隐藏；TTS 接受后无法发现式关闭
- P0-2 dsh-famling 人格化自由 LLM 聊天缺危机/健康/可见告知地板
- P0-3 首启先强制自报出生日期再读 TOS，但 roleplay 无公开入口

### P1（10）
- P1-1 首启同意 1 万字/36vh/11px，可读性低
- P1-2 强制披露/关键设置字号/对比度/缩放不达标
- P1-3 无障碍：气泡无 live region/宠物不可键盘聚焦/画布不尊重 reduce-motion
- P1-4 语音透明度与控制：AI 标识不可见；ASR/PTT/静音/音量/改名无入口
- P1-5 2h 健康提醒不完整
- P1-6 法务/声明与实现漂移
- P1-7 情感文案与健康目标冲突/夜间无安静默认/软性内疚
- P1-8 dsh-famling 低打扰/无障碍默认不足（无 quiet hours/reduce-motion/隐藏）
- P1-9 roleplay 设施与公开能力不一致
- P1-10 研究原型/工作助手口径与产品体验冲突

### P2（12）
- P2-1 右键菜单 17+ 项/开发入口/危险项混排
- P2-2 内容中心向终端用户展示协议/密码学细节
- P2-3 内容中心/同意页 8–10px 元数据密集
- P2-4 安静语义两端不同
- P2-5 插件内容中心 tablist 无键盘模型/对话框无焦点陷阱
- P2-6 插件缺清除本机设置/同意/撤回入口
- P2-7 2h banner 语义/层级问题
- P2-8 产品壳隐藏功能但 README 仍暗示可用
- P2-9 启动记忆回放像被监视
- P2-10 alwaysOnTop/无托盘/无全屏自动隐藏
- P2-11 试玩依恋探测缺 debrief/伦理审查
- P2-12 插件 AI/使用限制 11px/无每条回复 AI 标签

## 使用者/UX
原文：`docs/research/PROJECT-REVIEW-UX-2026-11-19.md`

### P0（4）
- P0-1 右键菜单 IA 与 480×336 不匹配（20+ 项/滚动两屏）
- P0-2 产品壳隐藏必需控件，只留开发面板；完整面板是单向门
- P0-3 存档损坏/恢复/退出保存提示与标志位矛盾
- P0-4 置顶/无边框/skipTaskbar/可拖动但无托盘/复位入口

### P1（10）
- P1-1 内容中心塞进 480×336 不可缩放小窗
- P1-2 菜单开合/点击穿透/点外不关闭
- P1-3 工具页入口不符合设计，Tauri 下可能静默失败
- P1-4 键盘与模态边界：菜单可穿到模态后面
- P1-5 字号/可读性只覆盖部分界面
- P1-6 发现性：右键是唯一入口但提示只有 22px/.55
- P1-7 设置 IA 不完整，已批准字段无落点
- P1-8 dsh-famling 四常驻按钮/四面板，按钮最小化未落地
- P1-9 dsh 错误恢复笼统，失败无下一步
- P1-10 Composer 失败恢复/稍后语义不完整

### P2（9）
- P2-1 危险动作直接放根菜单
- P2-2 菜单状态不反映真实状态
- P2-3 命名/身份不一致
- P2-4 文档 IA 漂移
- P2-5 右键抑制原生菜单，文本域失去复制粘贴
- P2-6 菜单视觉/触达细节
- P2-7 插件内容中心键盘/尺寸细节
- P2-8 单实例缺失
- P2-9 app icon 仍是 Tauri 默认图标
