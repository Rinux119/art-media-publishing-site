# Changelog

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)（SemVer）：`MAJOR.MINOR.PATCH`

- **MAJOR**：不兼容的 API 变更
- **MINOR**：向后兼容的功能新增
- **PATCH**：向后兼容的 Bug 修复

## [2.30.0] - 2026-07-31

### Added

- 画幅选择器新增两种画幅：3:2 (6x9) 位于 6x8 与 6x12 之间、5:4 (8x10) 位于 4x5 之下。两者旋转与画格比例逻辑分别复用 3:2 (135) 与 5:4 (4x5)，但缩略图列数分别固定为 2 列与 1 列

### Changed

- anthology/archiving 子页缩略图列数改为按画幅固定，不再随设备宽度变化，核心逻辑是适配标准底片收纳页（Print File 等标准活页）的物理宽度与行数：135=6 列、Half=12 列、X-Pan=3 列、6x4.5=4 列、6x6=3 列、6x7/6x8/6x9/6x12=2 列、6x17/4x5/8x10=1 列
- 删除响应式 media query 中的 `.thumb-grid-anthology-sub` 列数规则（原 4/3/2/1 列随设备宽度变化）
- 合集与归档类型的文本区块进入管理后默认收起（`is-collapsed`），与媒体区块行为一致

### Fixed

- 修复固定列数 CSS 选择器未生效的问题：`#wall-grid` 元素自身就是 `.thumb-grid-anthology-sub`，但原选择器 `#wall-grid[data-media-format] .thumb-grid-anthology-sub`（后代选择器）要求 `.thumb-grid-anthology-sub` 是 `#wall-grid` 的后代元素，导致不匹配。改为同一元素选择器 `.thumb-grid-anthology-sub[data-media-format]` 正确匹配元素本身

## [2.29.0] - 2026-07-31

### Fixed

- 修复 anthology/archiving 子页画幅旋转在图片缓存命中时失效的问题：`public-collection.js` 的 `markPortraitImage` 在 `createMediaNode` 内被调用时，`img` 刚 `createElement` 出来、刚设了 `src`，但**还没被 append 到 DOM**。当图片未缓存（首次进入 / 强制刷新）时，`img.complete` 为 false → 走 `else` 挂 `load` 监听器 → load 事件在 img 被 append 后触发 → `closest()` 能找到 wrap → 正常加 `is-rotated`；当图片已缓存（普通刷新）时，浏览器对缓存图片同步把 `img.complete` 与 `naturalWidth` 置为 true → 走 `if` 分支同步调用 `check()` → 但此时 img 还没进 DOM，`img.closest('.media-item')` 返回 null → `if (!wrap) return` 直接退出，**且因为已走 if 分支不再挂 load 监听器** → `is-rotated` 永远加不上。现 `wrap` 为 null 时用 `requestAnimationFrame(check)` 在下一帧重试，覆盖「动态创建 + 缓存命中」「动态创建 + 未缓存」「SSR + 缓存命中」「SSR + 未缓存」四种时序

## [2.28.0] - 2026-07-30

### Added

- 5 份 README（zh-CN / zh-TW / zh-HK / en / ja）同步新增「作品集展示样式使用指南」章节：梳理 6 种展示样式（single / diptych / wall / report / anthology / archiving）的差异、推荐用途与选择方法，说明合集与归档的区块级「画幅/展示方式」设置，并整理后台创建与发布流程、发布与访问控制、Lightbox 大图查看等使用要点

### Fixed

- 修复测试运行结束后 Node 进程不退出的问题：`i18n` 库的 `autoReload: true` 在 `locales/` 目录上创建了 `fs.watch` 句柄，关闭服务器后仍保持进程存活。现测试模式下禁用 `autoReload`，配合 `server.closeAllConnections()` 与 undici 短 keep-alive dispatcher，测试套件可在约 7 秒内正常退出
- 修复视频相关测试用例在未设置 `FFMPEG_PATH` 环境变量时误判 ffmpeg 不可用并全部 SKIP 的问题：`_ffmpegPath` 现按 `process.env.FFMPEG_PATH` → `require('ffmpeg-static')` → `'ffmpeg'` 的顺序解析，`processUploadedVideo 将非H.264视频转码为H.264 MP4` 用例补齐 `{ skip: !_ffmpegAvailable }` 守卫，与其他视频测试保持一致
- 修复访问日志自动清理测试用例的阈值与 `MAX_VISIT_LOGS = 500` 不匹配的问题：原测试仅插入 210 条日志并断言 `<= 201`，但清理阈值实际为 500，导致断言恒为失败。现调整为插入 510 条日志并断言 `<= 501`

### Changed

- `test/server.test.js` 中 7 处 `process.env.FFMPEG_PATH || 'ffmpeg'` 统一替换为 `_ffmpegPath`，避免重复解析并保证与 `_ffmpegAvailable` 判定一致

## [2.27.0] - 2026-07-30

### Tests

- 补全 anthology / archiving 二级路由与区块级 `media_format` 的测试覆盖（14 个用例）：
  - 子页按 `block.media_format` 渲染：single 不叠加 `thumb-grid-anthology-sub`、diptych 走双联画布局、wall 走照片墙布局、report 走图文混排布局、3:2 等画幅比例叠加 `thumb-grid-anthology-sub` 与 `data-media-format`
  - 管理端 `allowedFormats` 白名单校验：展示方式取值（single/diptych/wall/report）通过、非法值被重置为 `3:2`
  - 发布流程：`published_media_format` 与 `media_format` 同步
  - 大图页：anthology 子页 diptych 渲染双图 hero
  - 首页布局：anthology 渲染封面网格与标题、空标题 block 不渲染占位、archiving 渲染纯文字列表且不含图
  - 子页底部「返回上一级」链接
  - archiving 子页与 anthology 子页渲染一致

## [2.26.0] - 2026-07-30

### Fixed

- 修复 anthology/archiving 子页未按区块级展示方式渲染的问题：路由 `/:slug/:blockId` 原本硬编码 `displayType: 'single'`，导致 media block 选择的「单幅瀑布流 / 双联画 / 照片墙 / 报告」四种展示方式在前台一律按单幅瀑布流渲染。现在按 `block.media_format` 决定子页布局，diptych 走双联画布局、wall 走照片墙布局、report 走图文混排布局
- 修复管理端更新区块 `media_format` 时「展示方式」取值（single/diptych/wall/report）被白名单校验重置为 `3:2` 的问题：`routes/admin.js` 的 `allowedFormats` 仅含画幅比例，现已补入四种展示方式取值
- 修复子页 `thumb-grid-anthology-sub` 类与 `data-media-format` 属性的误叠加：当 `media_format` 属于展示方式取值时不再叠加该类与属性，避免 4 列网格 + `aspect-ratio` + `object-fit: contain` 样式覆盖 single/diptych/wall/report 的标准布局
- 修复 anthology/archiving 子页大图页未按区块展示方式渲染的问题：`/:slug/:filename_large?block=:id` 现读取该 block 的 `published_media_format`，diptych 时按双图并排展示
- 补全 anthology/archiving 子页选「报告」展示方式时的「返回上一级」链接

## [2.25.0] - 2026-07-30

### Changed

- 文本管理区块配置区与媒体管理区块统一：采用相同的 `media-config-panel`（标题输入 + 画幅/展示方式 + 上传到阐述 + 选择文件）→ 主编辑区 → `media-order-bar`（操作栏）三段式布局，文本编辑器顶部虚线分割线与媒体网格风格一致
- 文本区块「保存文本」按钮置于底部操作栏右端，位置与媒体区块「保存顺序」按钮对齐；移除原 `block-text-actions` 行内布局
- 文本区块画幅/展示方式选择器固定为「文本模式下不可选」并禁用（disabled），与其他展示类型的不可选样式保持一致
- 修复媒体库上传按钮文本切换逻辑：保护按钮内 `<span>` 子元素结构，避免上传完成后按钮文案丢失图标包装

### Fixed

- `findTextareaForButton` 定位逻辑：因配置区重构后 `btn-save-text-block` 不再是 `.block-text-editor` 的子元素，改用 `.block-card` 作为祖先节点查找 textarea

## [2.24.0] - 2026-07-30

### Added

- 媒体管理区块画幅选择器升级为「画幅/展示方式」：anthology 和 archiving 类型新增「展示方式」选项组（单幅瀑布流 single、双联画 diptych、照片墙 wall、报告 report），与原「画幅」选项组并列；选中某展示方式时该区块按对应样式渲染，为合集与归档提供按区块切换展示方式的能力
- 多语言词条新增：`displayMode`（展示方式）、`aspectRatio`（画幅）、`formatSingle`（单幅瀑布流）、`formatDiptych`（双联画）、`formatWall`（照片墙）、`formatReport`（报告），4 语言同步

### Changed

- 所有展示类型的媒体区块统一显示「画幅/展示方式」配置区：single/diptych/wall/report 类型固定为对应的展示方式且不可选（disabled），与 anthology/archiving 视觉布局保持一致；移除「该样式下不可选」占位文案
- 画幅选择器 optgroup 分组：使用 `<optgroup>` 将「展示方式」与「画幅」分为两组，提升可读性

## [2.23.0] - 2026-07-30

### Added

- anthology 和 archiving 媒体区块新增画幅选择功能：可在媒体管理区块中选择多种胶卷画幅比例（3:2/135、2:3/Half、2.7:1/X-Pan、4:3/6x4.5、1:1/6x6、1.16:1/6x7、1.37:1/6x8、2.25:1/6x12、3:1/6x17、5:4/4x5），前台根据画幅比例控制图片旋转和画格比例（竖图旋转 90° 填满画格，主体侧躺）；数据库新增 `media_format` 和 `published_media_format` 字段
- 新增多语言词条：`selectFile`（选择文件）、`anthologyTitle`（合集标题）、`mediaFormat`（画幅）、`orderMediaHint`（拖动媒体调整展示顺序），4 语言同步

### Changed

- anthology 一级和二级 Grid 布局改为胶卷「接触印相」（Contact Printing）风格：画格固定比例、统一排列，模拟胶卷底片印相的视觉效果
- 管理后台媒体区块配置区重新设计为语义化分区结构：采用 `media-config-panel`（合集标题 + 画幅选择 + 上传区）与 `media-order-bar`（保存顺序）分区布局，替代原有单行 flex 布局；各字段添加 label 标签（合集标题、画幅、上传媒体），file input 改为自定义 label 按钮统一对齐样式，选中文件后显示文件名

## [2.22.2] - 2026-07-28

### Changed

- 后台作品集管理的区块默认折叠行为按展示类型区分：anthology（合集）和 archiving（归档）类型因可能包含大量区块，进入管理后所有区块默认折叠；其他展示类型保持默认展开

## [2.22.1] - 2026-07-28

### Changed

- 作品阐述区块更名为「文本管理」：区块标题、占位符文案、上传按钮、保存按钮、添加区块按钮均同步更新（「作品阐述」→「文本管理」、「上传图片/视频到阐述」→「上传媒体」、「保存文案」→「保存文本」、「+ 添加阐述区块」→「+ 添加文本区块」），4 语言（zh-CN/zh-TW/en/ja）同步
- 「输入文档标题」改为「输入文本标题」，4 语言同步
- 优化后台区块样式：`.panel-soft` 改为直角边框卡片（移除圆角），文本区块文档标题栏外层包裹 `.panel-soft` 与媒体区块视觉风格统一；`.block-title-row` 移除虚线分割线自然融入面板；`.block-text-editor` 新增 flex 纵向布局统一组件间距
- 「+ 添加文本区块」与「+ 添加媒体区块」按钮与下方「草稿更新」卡片之间增加行距（`margin-bottom: 24px`）

## [2.22.0] - 2026-07-28

### Added

- 新增第六种展示方式「归档（archiving）」：与合集（anthology）类似支持多个媒体区块和阐述区块，但一级页面以标题列表形式展示（非缩略图网格），标题来源为媒体区块的「合集标题」和阐述区块的「文档标题」；点击标题进入对应区块的二级页面，二级页面底部提供「返回上一级」链接；空标题不在前端显示
- 作品阐述区块新增「文档标题」输入框：所有展示类型的阐述区块均可输入文档标题，标题在区块标题旁显示预览；归档展示方式的一级页面以此标题作为列表入口

## [2.21.1] - 2026-07-28

### Fixed

- 修复作品阐述文本框上传图片/视频时返回 403 Forbidden：CSRF 中间件在 multer 解析 multipart body 之前执行，读不到 `req.body._csrf`，改为通过 `X-CSRF-Token` header 发送 token，与现有 fetch 调用保持一致

## [2.21.0] - 2026-07-28

### Added

- 作品阐述（Markdown 文本框）新增「上传图片/视频到阐述」功能：在作品集级阐述、媒体项级阐述、文字区块的三类文本框旁新增上传按钮，点击后选择文件，上传完成后自动在光标位置插入 Markdown 引用（图片为 `![alt](url)`，视频为 `<video controls src="url"></video>`）；上传的文件保存到 `content/media_library/`，图片经 sharp 生成 thumb/medium/large 变体并压缩原图，视频经 ffmpeg 转码为 H.264 MP4
- 媒体库孤儿文件自动清理：扫描数据库中所有 markdown 文本框（`collections.report_markdown`/`published_report_markdown`、`media.report_markdown`/`published_report_markdown`、`collection_blocks.markdown`/`published_markdown`）引用的文件名，与 `content/media_library/` 中的实际文件对比，删除没有任何文本框引用的文件。清理时机：服务启动时、保存阐述后、发布更新后

## [2.20.5] - 2026-07-28

### Fixed

- 修复页脚「显示信息」模式下添加多条社交链接时的样式错乱：删除脆弱的 `#contact > a:nth-child(3)` 位置选择器（当社交链接≥2条时会误中第2条链接，使其变成备案号同款灰色9px小字，同时备案号反而脱离该规则变回正常字号），改用 `.footer-compact-meta` class 精确命中备案号；首页页脚备案号补上 `footer-compact-meta` class，与作品集页脚保持一致
- 修复社交链接标签被挤压换行：`#contact > a` 和 `#contact > a > p.textColor` 的固定 `width: 60px` 改为 `auto`，长标签（如 "Open Source Project"）不再被压窄

### Changed

- 调整页脚各行间距：社交链接与备案号的 `margin-top` 由 `5px` 改为 `2px`，行与行更贴近

## [2.20.4] - 2026-07-27

### Fixed

- 修复 Lightbox 大图查看中作品阐述文字与图片间距过大：移除 `.lightbox-body` 的 `height: 100%`，让文字紧贴图片下方；`.lightbox-report` 顶部 padding 由 16px 减至 6px（移动端由 12px 减至 4px）

## [2.20.3] - 2026-07-27

### Fixed

- 修复 Lightbox 大图查看中作品阐述文字未与图片左对齐的问题：新增 `alignReportToMedia` 动态计算 `.lightbox-media-wrap` 的位置并设置 `.lightbox-report` 的左右 padding，使文字内容区域与图片容器左右对齐；diptych 模式下文字与左边图片左对齐；窗口尺寸变化时自动重算

## [2.20.2] - 2026-07-27

### Changed

- 调整媒体区块上传照片的默认排序：新上传的照片 ID 由「追加到末尾」改为「前置到开头」，使最新上传的照片在区块内自动排在第一位（anthology 首页的合集入口缩略图也会同步更新为最新照片）

## [2.20.1] - 2026-07-27

### Changed

- 调整单幅（single）和双联画（diptych）缩略图指针悬浮/聚焦的明度下降幅度：`filter: brightness(0.7)` → `brightness(0.8)`，悬浮时亮度由 70% 调至 80%

## [2.20.0] - 2026-07-27

### Added

- 新增第五种展示方式「合集（anthology）」：作品集首页以 Grid 网格展示多个合集入口（每个媒体区块对应一个合集，缩略图为该区块的第一张图片），点击入口进入该合集的缩略图页面
- 媒体区块新增「合集标题」字段：在作品集管理的媒体区块卡片头可独立设置标题，标题会显示在 anthology 首页每个合集缩略图下方；其他展示类型的标题仅在管理界面显示，不在前台展示
- anthology 二级页面底部新增「返回上一级」链接：点击返回 anthology 首页，避免 `history.back()` 在直接访问 URL 时失效

### Changed

- anthology 首页和二级页面的缩略图布局改为固定 Grid（最大 4 列，1:1 正方形单元，`object-fit: contain` 完整显示不裁切，留白部分显示白色背景）
- 非 anthology 展示类型缩略图悬浮效果由「降低饱和度」改为「降低明度」（`filter: brightness(0.7)`），anthology 两级 Grid 取消指针悬浮的明度下降效果
- 「已加载全部内容」提示文案改为只在 anthology 二级页面显示「返回上一级」（其他展示类型不再显示「已加载全部内容」）

### Fixed

- 修复保存媒体区块标题时照片丢失的问题：前端 `saveBlockTitle` 仅发送 `title` 字段，后端原逻辑把缺失的 `media_ids` 当作空数组保存，覆盖了原有照片；改为按字段独立更新，仅在请求中明确包含对应字段时才更新

## [2.19.1] - 2026-06-08

### Fixed

- Lightbox 大图查看中作品阐述不换行：前端 Markdown 渲染未启用时，原始文本的换行符被 HTML 合并为空格；marked 可用时补充 `breaks: true` 配置
- Lightbox 大图查看右侧滚动条影响美观：隐藏 `.lightbox-report` 滚动条，保留滚动功能
- 后台媒体排序拖拽与文字选择冲突：在 textarea/input 内拖选文字时会误触发媒体卡片排序拖拽，新增 mousedown 事件追踪拖拽来源，阻止输入区域内的拖拽行为

## [2.19.0] - 2026-06-08

### Added

- 访问统计支持 IP 屏蔽：新增 `EXCLUDED_IPS` 环境变量，在 `.env` 中填写需屏蔽的 IP（逗号分隔），访问统计页面将不再显示这些 IP 的记录与计数

### Changed

- 访问统计最大保留记录数从 200 提升至 500
- 访问统计页面展示条数从 200 提升至 500

## [2.18.2] - 2026-06-01

### Fixed

- CDN_URL 环境变量支持无协议前缀写法（如 cdn.example.com），自动补全 https://
- 修复 CDN 地址被当作相对路径拼接到当前域名下的问题，传入 public-site 的 cdnUrl 统一使用完整 origin（含协议）

## [2.18.1] - 2026-06-01

### Fixed

- 系统设置关于卡片 ffmpeg 检测增加系统 PATH 回退：当 getFfmpegPaths() 返回的路径不存在时，spawnSync 尝试系统 PATH 中的 ffmpeg/ffprobe，确保设置页面显示状态与实际视频处理能力一致

## [2.18.0] - 2026-06-01

### Changed

- 通知栏改为固定定位 Toast 样式，不再占据文档流，消除页面跳动；添加淡入淡出动画（0.35s），滞留时间延长至 3.5 秒
- 系统设置关于卡片 ffmpeg 检测改用 videoProcessor.getFfmpegPaths() + fs.existsSync，与实际视频处理使用相同路径

### Fixed

- 调整媒体顺序后正确提示"当前有未发布改动"（对比当前媒体顺序与 published_media_ids，保存/发布后同步更新客户端状态）
- 发布后仍提示"当前有未发布改动"（发布成功后同步更新 data-published-media-ids）
- FFmpeg 检测回退：当 resolveBinaryPath 返回的路径二进制损坏时，自动回退到系统 PATH（ffmpeg/ffprobe），并更新 ffmpegProbe 路径供后续视频处理使用

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
