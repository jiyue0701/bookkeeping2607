# 米糕记账 v1.6 设计与交互 QA

- source visual truth：`D:\越\ui-audit\current-review\` 与 `D:\越\ui-audit\current-review\米糕记账-v1.5-用户视角复查.md`
- implementation screenshots：`D:\越\ui-audit\v1.6-r2-final-*.png`、`D:\越\ui-audit\v1.6-calendar-final.png`
- full-view comparison evidence：`D:\越\ui-audit\compare-r2-*.png`
- focused comparison evidence：`D:\越\ui-audit\compare-r2-add.png`（弹层与表单节奏）、`D:\越\ui-audit\compare-r2-calendar.png`（日历与底部安全区）、`D:\越\ui-audit\compare-r2-settings.png`（分组列表）
- viewport：390 × 844，iPhone 竖屏模拟
- states：首页空状态/有数据、记账弹层、账单流水、日历、统计趋势、分类排行、我的

## Findings

本轮最终对照未发现仍需修复的 P0、P1 或 P2。v1.5 审查指出的核心问题均已落实：

- 底部导航只保留首页、账单、统计、我的四个页面入口；记账动作成为首页 Tab Bar 上方的独立 accessory，语义上不属于 Tab。
- 首页仅保留“月度摘要 + 米糕”作为主要视觉焦点；今日记录收紧为轻量列表，米糕小贴士压缩为一行入口。
- 账单与日历的月度摘要改为无阴影紧凑行，账单按日期分组；删除入口收进“更多”，删除后提供撤销。
- 记账弹层使用固定标题、固定保存按钮和唯一内容滚动区；金额、备注、分类顺序保持不变，首屏只呈现常用 8 类，全部 28 类可展开，日期与账户放入更多选项。
- 统计页移除重复的大摘要卡，改用每日合计圆角柱形图；提示框默认隐藏，触摸或拖动时显示。排行使用扁平行和细进度条。
- “我的”改成资料头、数据与备份、云同步、关于与帮助的 grouped list；Worker 地址放入高级设置，分类预览和长说明默认折叠，版本号位于页尾。

## Required fidelity surfaces

- Fonts and typography：系统字体栈保持 iOS 原生感；正文 400–500、标签 500–600、标题与关键金额 700。主要说明文字为 13px 及以上，图表轴标签作为辅助信息例外。
- Spacing and layout rhythm：主摘要 22px 圆角，普通分组 16px，输入与小控件 12px；普通分组不再使用阴影。日历单元压缩到 48px，首条当天记录可在底部导航上方完整看到。
- Colors and visual tokens：保留 v1.5 薄荷纹理与近白雾面；薄荷色用于选择与主操作，珊瑚红仅用于支出和破坏性动作。
- Image quality and asset fidelity：继续使用两张透明米糕 PNG；默认图双眼睁开，互动图只闭左眼、右眼保持睁开。图片预加载叠放，互动不重绘整页。
- Copy and content：页面文案由长说明改为短标题、状态副文案和折叠详情；金额保持人民币元与两位小数。
- Icons：界面图标继续使用本地 Tabler SVG 资源，未新增字符图标、emoji 或手绘 SVG 替代物。
- Accessibility and interaction：可见触控目标均不小于 44 × 44；有明确按压态、焦点态和 `prefers-reduced-motion`；390px 无横向溢出。

## Comparison history

### Iteration 1 — blocked

Evidence：`D:\越\ui-audit\compare-r1-*.png`

- [P1] 记账按钮仍以宽胶囊悬浮在内容之上，遮住日历详情、统计速览和云同步输入。
  - Fix：改为仅首页显示的 58px Tab Bar accessory；其他页面由页面自身入口承担新增动作，并用 `[hidden]` 确保不占位。
- [P2] 首页有数据时三条今日记录使贴士入口进入悬浮按钮区域。
  - Fix：首页仅展示最近两条，完整记录通过“查看全部记录”进入账单页。
- [P2] “我的”状态文案仍偏长，分组列表首屏密度不够稳定。
  - Fix：增加本机快照、JSON 备份、云同步的短状态文案，完整说明留在折叠详情。
- [P2] 日历格高度使当天第一条详情仍被底部导航遮住。
  - Fix：日历触控格收紧为 48px，在维持 44px 触控下限的同时让首条详情完整露出。

### Iteration 2 — passed

Evidence：`D:\越\ui-audit\compare-r2-*.png`

- 首页空/有数据均形成单一焦点，贴士与底部 accessory 不重叠。
- 账单、统计、排行与“我的”不再显示悬浮记账按钮，不遮挡页面内容。
- 日历首条当天记录完整显示在底部导航上方，并可继续滚动查看其余记录。
- 记账弹层首屏自然显示金额、备注、8 个常用分类、更多选项与保存按钮。

## Functional regression

Automated evidence：`D:\越\ui-audit\v1.6-regression-final.png`

- X 图标、关闭按钮空白区、遮罩均能关闭记账弹层；帮助弹层三种关闭方式同样通过。
- 记账弹层外层 `overflow: hidden`、内容区 `overflow: auto`，页面背景锁定，仅一个滚动容器。
- 金额 `12.34` 保存为 `1234` 分；旧 storage key、schema version 与账单结构未改变。
- 常用分类首屏 8 项，展开后 28 项；日期与账户默认隐藏，展开后完整出现。
- 删除入口位于更多操作，删除后可撤销并恢复原记录。
- 每日统计使用柱形图，默认不显示 tooltip。
- 离线重载成功：service worker 已控制页面，断网后页面完整加载，测试账单仍保留。
- 四个 Tab、所有可见触控目标、无横向溢出、米糕互动不替换页面节点均通过。

## Follow-up polish

真机上仍建议观察 Safari/PWA 的系统字体缩放、VoiceOver 朗读顺序与键盘弹出时的可视高度；这些不阻塞本次发布。

final result: passed
