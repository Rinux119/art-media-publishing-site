# Changelog

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)（SemVer）：`MAJOR.MINOR.PATCH`

- **MAJOR**：不兼容的 API 变更
- **MINOR**：向后兼容的功能新增
- **PATCH**：向后兼容的 Bug 修复

## [2.8.4] - 2026-05-31

### Fixed

- 作品报告模式图片使用 `large`（2400px）变体替代 `thumb`（400px），修复单图展示模糊问题
- 作品报告模式单图（cols-1）去除黑边：容器和图片元素背景改为透明，容器高度改为自适应，溢出改为可见

## [2.8.3] - 2026-05-31

### Fixed

- 修复后台作品集管理页面"管理媒体"和"发布更新"按钮点击无反应的问题：i18n 翻译键名 `showingCount` 与 locale 文件中的 `showingMediaCount` 不匹配，导致 `updateMediaFilters()` 初始化时抛出 TypeError，脚本中断执行，所有按钮事件监听器未能绑定
- 修复 `@vite/client` 请求返回 404 的问题：将路由从公共路由之后移至 `i18nMiddleware` 之后、`registerPublicRoutes()` 之前，避免被 `/:slug/:mediaLarge` 通配路由先匹配
- 公共路由 `isReservedSlug` 新增 `@vite` 保留路径，防止 Trae IDE 浏览器预览注入的 `/@vite/client` 请求被当作作品集 slug 处理

## [2.8.2] - 2026-05-30

### Fixed

- 后台设置页面"运行环境"FFmpeg 检测改用 `videoProcessor.getFfmpegPaths()` 获取已解析路径，修复检测不到已安装 ffmpeg-static 的问题
- 新增 `getFfmpegPaths()` 导出方法，供后台设置页面复用路径解析

## [2.8.1] - 2026-05-30

### Fixed

- `videoProcessor.js` 修复 Windows 上 `fs.accessSync` 对 `.exe` 文件的 `X_OK` 权限检查误判（Windows 不使用 Unix 权限位）
- 修复 `ffmpeg-static` 返回对象 `{ path }` 而非字符串时的路径提取
- 修复 `@ffprobe-installer/ffprobe` 在 Windows 上路径缺少 `.exe` 后缀的问题
- 新增 `where name.exe` 备用搜索
- `spawn`/`spawnSync` 添加 `windowsHide: true` 避免弹出控制台窗口
- 新增 ffmpeg/ffprobe 路径和可用性诊断日志

## [2.8.0] - 2026-05-30

### Added

- 新增 `start.sh`（macOS/Linux）和 `start.bat`（Windows）一键启动脚本
- 新增 `lib/setup.js` 自动化设置模块（自动创建 `.env` 并生成随机密钥、自动安装依赖、检测 FFmpeg/FFprobe）
- `videoProcessor.js` 跨平台 FFmpeg/FFprobe 路径解析（支持 Windows 路径、npm 包内置二进制 `ffmpeg-static` + `@ffprobe-installer/ffprobe`、Homebrew/snap/Chocolatey 路径）
- `server.js` 启动时自动创建 `.env`
- `package.json` 新增 `setup` 脚本和 ffmpeg/ffprobe 静态二进制依赖

## [2.7.2] - 2026-05-29

### Fixed

- `.env.example` 中 `DEFAULT_ADMIN_PASSWORD` 未注释导致部署后默认密码为 `change-me-before-production` 而非文档所述的 `admin`，改为注释并默认使用代码 fallback 值 `admin`
- 首页大图默认值硬编码不存在的 `01.jpg` 导致重新部署后 404，改为自动扫描 `content/images/large/` 目录取第一张图片作为默认值
- 数据库初始化时打印默认管理员密码来源日志

## [2.7.1] - 2026-05-28

### Fixed

- 用户管理页面 i18n 翻译键名与 locale 文件不匹配导致界面显示原始键名而非翻译文本（19 处键名修正）
- 密钥生成表单未将 `keyConfirm1`/`keyConfirm2` 传递到服务端导致三次输入一致仍提示不一致
- 补充缺失翻译键（`changePasswordTitle`、`confirmGenerateKey`）
- 修正 `generateKeyTitle` 中未替换的 `{{name}}` 占位符
- 为密码相关表单添加 `autocomplete` 属性防止浏览器自动填充干扰

## [2.7.0] - 2026-05-28

### Added

- 新增 `locales/ja.json` 翻译文件（355 个 key，与其他语言 key 结构一致）
- `lib/i18n.js` 的 `locales` 和 `SUPPORTED_LOCALES` 数组新增 `ja`
- `resolveLocale` 函数新增日语 Accept-Language 匹配规则
- 系统设置页面语言下拉框新增「日本語」选项

## [2.6.1] - 2026-05-28

### Fixed

- `marked` 库改用动态 `import()` 加载以兼容 ESM 模块（修复生产环境 `ERR_REQUIRE_ESM` 启动失败）
- 语言设置保存后即时生效（AJAX 提交 + 页面内容替换）
- 系统设置语言卡片添加"语言/Language"标题与提示文本
- 修复集成测试中硬编码中文断言在 i18n 默认语言变更后失败的问题，所有测试请求添加 `Accept-Language` 头并使用中英双语匹配

## [2.6.0] - 2026-05-28

### Added

- 引入 `i18n` 库，前台页面根据浏览器 Accept-Language 自动匹配语言（简体中文、繁体中文、英文）
- 后台页面同样自动匹配，并可在系统设置中指定后台语言（优先于浏览器语言）
- 翻译文本存储于 `locales/` 目录（zh-CN.json、zh-TW.json、en.json）
- EJS 模板中硬编码文本替换为 `__()` 调用，客户端 JS 通过 `window.__i18n` 获取翻译
- 服务端路由错误消息使用 `req.__()` 替换硬编码中文
- HTML 缓存 key 加入 locale 维度
- 系统设置页面新增语言选项
- 新增 7 个集成测试覆盖 i18n 功能

## [2.5.0] - 2026-05-27

### Added

- 新增用户管理页面（`/admin/users`），支持创建用户、修改密码（需旧密码验证）、删除用户（默认 admin 不可删）
- 每用户独立密钥，管理员可在后台生成密钥（三次确认+确认弹窗），生成后显示一次明文供确认
- 密钥已配置时显示"清除密钥"按钮（二次确认），清除后可重新生成
- 密码重置页面（`/passwd`）使用数据库中的每用户密钥哈希验证，不再依赖 `.env` 中的 `RESET_KEY`
- 用户管理仅 admin 可访问（`requireAdmin` 中间件）
- 登录页、密码重置页、后台导航全面中文化
- 用户列表 API 返回 `has_reset_key` 布尔值而非哈希值
- 新增 6 个集成测试覆盖密钥生成/清除/防重复/三次确认/权限控制/API 安全

## [2.4.1] - 2026-05-27

### Changed

- 后台顶部导航按钮排序改为"首页"-"菜单测试"-"系统设置"-"Logout"
- 移除"访问统计"入口（访问统计页面仍可通过 `/admin/visitors` 直接访问）

## [2.4.0] - 2026-05-27

### Added

- 新增 32 个集成测试用例，覆盖 CSRF 防护验证、管理员登出、作品集删除与磁盘清理、IP 登录锁定、站点设置持久化、作品集类型切换与报告更新、媒体排序、非法文件类型校验、访问日志记录与自动清理、旧 URL 重定向、大图页渲染（single/diptych 模式）、错误路径与边界条件
- 视频测试跳过方式改为 `test skip` 选项
- 新增 8 个辅助函数提升测试可维护性

## [2.3.0] - 2026-05-27

### Added

- 新增 `lib/session-store.js`，基于 `better-sqlite3` 将 Session 数据存入 `sessions` 表，服务重启后登录态不丢失
- 过期 Session 自动清理
- 新增 12 个单元测试与 1 个重启后 session 有效的集成测试

## [2.2.0] - 2026-05-27

### Added

- 系统设置页面：业务配置（站点名称、署名、备案号、社交媒体链接）与媒体处理参数（图片变体宽度/压缩质量、视频 CRF/码率/分辨率/编码预设）在线修改并立即生效
- 新增 `config.js` 配置模块，业务配置存储于数据库 `settings` 表
- `FFMPEG_PRESET` 环境变量已被系统设置页面中的视频编码预设取代

## [2.1.0] - 2026-05-26

### Added

- 后台来访者 IP 记录：Dashboard 卡片 + 访问统计详细页面、按日期/访问次数排序、自动保留 200 条
- 保存排序按钮移至作品集管理标题栏
- Nginx 反向代理需配置 `X-Forwarded-For` 头以获取真实客户端 IP

## [2.0.2] - 2026-05-22

### Changed

- 移除已完成的 `photos` → `media` 迁移逻辑
- 清理残留表 `photos_new`/`media_new`

## [2.0.1] - 2026-05-22

### Fixed

- CSP 动态读取 `CDN_URL` 允许 CDN 域名加载图片/视频
- 数据库迁移逻辑保留完整数据

## [2.0.0] - 2026-05-22

### Changed

- 术语重构：数据库表 `photos` → `media`、路由/变量/CSS 类名全面统一、项目名 `photography` → `art`、自动迁移逻辑

## [1.3.0] - 2026-05-22

### Added

- CSRF 防护
- CSP/HSTS 环境感知
- IP 登录限速
- 自定义异常
- 视频元数据缓存
- `FFMPEG_PRESET` 可配置

## [1.2.0] - 2026-05-21

### Changed

- CDN 加速
- 视频格式从 HLS 切回 H.264 MP4
- Safari 兼容修复

## [1.1.0] - 2026-05-19

### Changed

- 后台 UI 改进
- 未发布提示
- 404 页面
- Logo 更新

## [1.0.0] - 2026-05-16

### Added

- 草稿/发布工作流
- 代码结构化拆分
- 运维脚本
- 作品集状态开关

## [0.2.1] - 2026-04-27

### Changed

- 备案号样式调整

## [0.2.0] - 2026-04-21

### Added

- FFmpeg 转码
- 缓存体系
- 内存优化
- CPU 修复

## [0.1.0] - 2026-04-19

### Added

- 初始构建：基础站点、图片上传、双联画、Sharp 配置
