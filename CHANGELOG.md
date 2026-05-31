# Changelog

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)（SemVer）：`MAJOR.MINOR.PATCH`

- **MAJOR**：不兼容的 API 变更
- **MINOR**：向后兼容的功能新增
- **PATCH**：向后兼容的 Bug 修复

## [2.17.2] - 2026-06-01

### Fixed

- 修复媒体排序保存后不生效的问题（拖拽排序仅更新 media.order_index，未同步更新 collection_blocks.media_ids，导致刷新/发布后排序恢复原样）
- 修复媒体排序保存提示"草稿保存失败"的问题（fetch 请求缺少 Accept: application/json 头，服务端返回 HTML 而非 JSON；block update 请求改用 application/x-www-form-urlencoded 格式确保 media_ids 正确解析）
- 媒体排序拖拽结束后自动保存，无需手动点击保存按钮

## [2.17.1] - 2026-06-01

### Fixed

- 修复媒体管理中拖动排序失效的问题（区块手柄拖动逻辑的 dragstart 事件冒泡阻止了媒体项拖动，优先判断 .media-item 放行）

## [2.17.0] - 2026-06-01

### Changed

- Works 导航由下拉选单改为展开导航，点击 Works 按钮后链接从右侧展开，横排排列，超出宽度自动换行
- Works 导航展开/收起增加 clip-path + opacity 动画（展开 0.35s、收起 0.25s）

### Fixed

- 修复 Works 导航展开时按钮轻微跳动的问题（链接容器改为始终 display: flex，用 clip-path/opacity/pointer-events 控制可见性，避免 display 切换导致布局重算）

## [2.16.0] - 2026-05-31

### Added

- 新建作品集时自动创建默认媒体区块和阐述区块，解决部分作品集类型无法添加媒体区块导致无法传图的问题
- 所有作品集类型均可添加和删除媒体区块
- 非 report 类型作品集限制只能添加一个媒体区块，超出时弹出提示"当前作品集类型只支持一个媒体区块"
- 后台作品集顺序管理卡片新增拖动手柄（⠿），只有通过手柄才能拖动排序
- 后台作品集详情页区块卡片只有通过手柄才能拖动排序，避免编辑文字时拖选光标触发区块拖动
- 新增 `mediaBlockLimitReached` 多语言翻译（zh-CN/zh-TW/en/ja）

### Fixed

- 修复点击删除区块按钮时 `confirm()` 弹窗尚未确认、卡片就已因 `dragstart` 事件被加上 `.dragging` 类而视觉消失的 BUG（根因：区块卡片 `draggable="true"` 导致点击删除按钮同时触发拖动，改为只有手柄可拖动后此问题一并解决）
- 修复后台作品集顺序管理中拖动排序时点击按钮/链接/表单等交互元素也会触发拖动的问题（改为只有手柄可拖动）
- 修复后台作品集卡片添加拖动手柄后标题不再左对齐的问题（手柄与标题包入 `.collection-card-head-left` 容器）

### Changed

- 后台作品集顺序管理拖动手柄样式：14px 字号与标题对齐，grab/grabbing 光标
- 后台作品集详情页"添加媒体区块"按钮对所有作品集类型可见（不再仅限 report 类型）
- 后台区块删除不再限制媒体区块类型（所有类型均可删除）

## [2.15.0] - 2026-05-31

### Added

- 首页导航栏新增 Works 下拉选单，点击展开/收起，点击外部区域自动关闭
- 作品集页面导航改为与首页一致的 Works 下拉选单
- 系统设置新增"作品目录标签"配置项（worksLabel），可自定义 Works 按钮文字，默认值为 "Works"
- Works 选单样式：白色背景、虚线边框（与网站风格统一）

### Fixed

- 修复系统设置页面 Internal Server Error（模板引用了未定义的 version、license、runtimeInfo 变量）
- 修复关于卡片数据库版本始终显示"未检测到"的问题（改用 `SELECT sqlite_version()` 替代 `PRAGMA compile_options`）
- 修复关于卡片多语言键缺失导致显示原始键名的问题

### Changed

- 首页作品集标题由平铺链接改为 Works 下拉选单，改善多作品集时的布局

## [2.14.2] - 2026-05-31

### Fixed

- 修复作品集管理中区块变更（更新阐述、新增/删除/调整区块顺序）未提示"有改动未发布"的问题
- 为 `collection_blocks` 表新增 `is_published` 和 `is_deleted_draft` 字段，与 `media` 表保持一致
- 区块删除改为软删除（`is_deleted_draft = 1`），发布时才真正清理
- 后端 `has_pending_draft_changes` SQL 查询新增区块 `is_published = 0` 和 `is_deleted_draft = 1` 检测
- 前端 `hasPendingDraftChanges` 函数新增区块 `data-is-published` 检测
- 区块卡片添加 `data-is-published` 属性，供客户端实时判断发布状态
- 区块删除、文本保存、顺序调整操作后派发 `draft-changed` 事件，实时更新草稿指示器

### Changed

- 新增区块改为客户端动态插入 DOM，避免页面刷新，新区块默认收起
- 发布时同步设置区块 `is_published = 1` 并清理软删除区块

## [2.14.1] - 2026-05-31

### Fixed

- 修复管理作品集标题中引号与斜杠显示为 HTML 实体的问题（`&quot;`、`&#x2F;` 未正确渲染）
- 根因：i18n Mustache `{{name}}` 与 EJS `<%= %>` 双重 HTML 转义，将 `{{name}}` 改为 `{{{name}}}` 避免重复转义
- 同步修复 zh-CN、zh-TW、en、ja 四个语言文件

## [2.14.0] - 2026-05-31

### Added

- 区块卡片折叠/展开功能：点击"折叠区块"/"展开区块"按钮切换，折叠后仅显示标题栏，方便调整顺序
- 区块卡片"上一层"/"下一层"移动按钮：首尾区块自动禁用对应方向按钮
- 媒体项"标记删除"/"恢复"按钮：每个媒体项标题栏右侧新增独立删除按钮，无需展开即可操作
- 上传进度轮询（`pollUploadJob`）：视频转码等后处理完成后自动刷新页面

### Changed

- 区块头部按钮样式统一：折叠、移动、删除按钮均采用与"展开更多操作"一致的基础按钮样式（1px solid #b5b5b5、#fff 背景、34px 最小高度）
- 区块头部按钮顺序调整：折叠按钮 → 移动按钮组 → 删除按钮
- "添加文字区块"改为"添加阐述区块"，"添加图片区块"改为"添加媒体区块"
- 作品阐述输入框加长（min-height: 480px），便于输入长文
- 修复上传 403 错误：XHR 请求添加 `X-CSRF-Token`、`Accept`、`X-Requested-With` header

## [2.13.0] - 2026-05-31

### Changed

- 去掉"内容布局"卡片，每个区块变成独立的可拖拽卡片
- "媒体管理"卡片整合上传功能，每个媒体区块可独立上传图片/视频
- "作品阐述"卡片独立展示，直接编辑文字内容
- 区块间可拖拽调整排序，媒体项在区块内也可拖拽排序
- 上传接口支持 `block_id` 参数，上传后自动关联到指定区块

### Removed

- 移除独立的"上传媒体"区域（上传功能已整合到每个媒体管理卡片中）
- 移除"区块布局"卡片包装（区块直接作为顶级卡片展示）
- 移除 `block-editor.ejs` 模板（区块渲染已内联到 `collection_detail.ejs`）

## [2.12.0] - 2026-05-31

### Added

- 区块排序草稿/发布双状态：拖拽调整区块顺序后需发布才生效，前台不再提前更新
- 后台内容布局区块始终展开显示，文字区块直接展示编辑器，图片区块直接展示媒体选择器

### Changed

- 去掉"区块布局"独立卡片，改为"内容布局"内联展示，操作更直观
- 媒体选择器始终可见，无需点击展开

### Fixed

- 修复区块排序调整后前台立即生效的问题（新增 `published_order_index` 字段）
- 修复公开页面显示未发布的区块内容的问题

## [2.11.0] - 2026-05-31

### Added

- 作品集区块化布局系统：图片区块和文字区块可自由调整顺序，控制前台页面展示布局
- 后台区块编辑器：支持拖拽排序、展开编辑、添加/删除区块
- 所有展示模式（single/diptych/wall）均可添加多个文字区块
- 作品报告（report）模式可同时添加多个文字区块和图片区块
- 区块数据自动从旧版数据模型迁移，保留现有图片和阐述内容
- 发布时同步区块的草稿和发布状态

## [2.10.0] - 2026-05-31

### Added

- Lightbox 大图查看扩展至所有展示模式（single/diptych/wall/report），点击图片不再跳转新页面
- 双联画（diptych）模式 Lightbox 同时展示一对图片，按对导航切换，移动端自动上下堆叠
- 照片墙（wall）模式使用 Lightbox 查看大图，替代原有跳转行为

### Fixed

- 修复 wall 模式图片无法加载的问题：`wall-items-json` 和 `public-collection.js` 被错误排除
- 修复 `resolvedDisplayType` 变量在 `<head>` 中未定义导致所有作品集 500 错误

## [2.9.0] - 2026-05-31

### Added

- 作品集（single/diptych/report 模式）点击图片弹出 Lightbox 大图查看，不再跳转新页面
- Lightbox 支持左右箭头切换、键盘导航（Esc 关闭、← → 切换）、点击遮罩关闭
- Lightbox 底部展示当前媒体项的作品阐述（Markdown 渲染）
- 左上角显示当前位置计数（如 3 / 12）
- 视频媒体在 Lightbox 中自动静音循环播放
- 新增 `resources/lightbox.css` 和 `resources/js/lightbox.js`

### Fixed

- 作品报告模式图片使用 `large`（2400px）变体替代 `thumb`（400px），修复单图展示模糊问题
- 作品报告模式单图（cols-1）去除黑边：容器和图片元素背景改为透明，容器高度改为自适应，溢出改为可见

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
