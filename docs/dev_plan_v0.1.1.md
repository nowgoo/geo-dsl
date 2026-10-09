# Geometry DSL v0.1.1 开发方案

依据：`docs/spec_v0.1.1.md`（下称 spec，条款引用格式 §N）
目标：单仓库 JavaScript 实现，从源码到 SVG 全链路可运行，零运行时依赖。

---

## 1. 范围与交付物

**做**（spec §3）：2D 笛卡尔几何；Point/Line/Segment/Ray/Circle/Arc/Polygon/Polyline；28 个 primitives（§21-24）；labels/marks；SVG 渲染；自动 viewport；CLI。

**不做**（spec §4）：3D、CAS、约束求解、locus、动画、交互、函数绘图、圆锥曲线、GeoGebra 兼容。`view` 块为 optional，v0.1 不实现。

**交付物**：
- `geometry-dsl` npm 包（ESM，零依赖，node >= 22，`node --test`）
- 公开 API：`lex / parse / analyze / compile / renderSVG / compile(source)+renderSVG(document)`（§46、§71）
- CLI：`geometry render input.geo [-o out.svg] [--width N] [--height N] [--padding N]`（§66）
- 测试套件（含 golden SVG 测试与 §74/§75 两条验收用例）
- README + 语言参考 + ≥8 个 examples

---

## 2. 关键技术决策（开发前锁定）

| # | 决策点 | 结论 | 依据 |
|---|--------|------|------|
| D1 | label 的 text 与 offset 能否同时出现 | 不能，按 grammar `label point_ref (string \| "offset" point_literal)?` 只允许其一，同时出现报 SyntaxError | §13、§37 |
| D2 | 同一 selector 多个 style 块 | 按文档序合并，后写属性覆盖，不报错 | spec 未规定，取最小惊讶 |
| D3 | 同一对象重复 label 语句 | 合并（后写覆盖 text/offset），不报错 | spec 未规定 |
| D4 | style/canvas 中未知属性名 | ArgumentError（canvas 重复块也是 ArgumentError，§48） | §48 推广 |
| D5 | `view` 块 | parser 自然拒绝（不在 grammar 中）→ SyntaxError | §30 |
| D6 | SVG 数字格式化 | 统一 `fmt()`：四舍五入至 6 位小数、去尾零、整数不带小数点、`-0` 归一为 `0`。禁科学计数法 | 保证 golden 测试确定性 §43 |
| D7 | 拓扑排序稳定性 | 以文档定义序为优先次序遍历（重定义已禁止，名字唯一，排序确定） | §43 |
| D8 | `mark right_angle` 顶点 | 中间参数为直角顶点（spec 示例 `right_angle(C, E, B)` 中 E 为顶点） | §56、§74 |
| D9 | `circle(O, r)` vs `circle(O, A)` | 第二参静态类型为 Number → 半径；为 Point → radius = distance(O, A) | §21 |
| D10 | 字符串转义 | 仅支持 `\"` `\\` `\n`，其他 `\x` → SyntaxError（严格，防静默错误） | §12 |
| D11 | 非有限值防护 | 求值中出现 NaN/Infinity → GeometryError "non-finite value" | §27 推广 |
| D12 | 数值格式 | 全程 IEEE-754 Number；统一 EPSILON = 1e-9 常量模块；所有相等/退化判断走 epsilon | §27 |
| D13 | 交点索引 | 必须是无符号整数字面量 ≥ 1（语义层检查 AST 节点为 NumberExpr 字面量）；相切时实际交点数为 1，索引 2 → GeometryError | §26 |
| D14 | Arc 内部表示 | center/radius/startAngle/endAngle + 逆时针 sweep，sweep ≤ π（minor arc）；SVG 侧换算 large-arc-flag=0 | §18、§28 |
| D15 | Line/Ray 布局 | 在 engine 坐标系内用 Liang–Barsky 参数化裁剪到 viewport，再交给 renderer | §33、§31 |

---

## 3. 架构与模块接口

流水线（§2.3、§47）：

```
Source → Lexer → Parser → AST → Semantic → Geometry IR → DepGraph → Evaluate → Layout → SVG
```

目录采用 spec §44 结构。各模块单向依赖，边界即 spec §76 的 11 条 Rule：

| 模块 | 职责 | 禁止 |
|------|------|------|
| `src/lexer` | token 流 + Position(offset,line,column)；注释；`//` 保留 token | 任何语义判断 |
| `src/parser` | Pratt 解析 → §15 全部 AST 节点；statement 分发 | 几何计算（Rule 1） |
| `src/semantic` | 三阶段：收集绑定 → 引用解析/类型检查 → desugar；函数注册表（§49） | 输出 SVG（Rule 2） |
| `src/ir` | Document/Object/Definitions/几何结构（§17-19）；definition 保留 position 供运行期错误定位 | — |
| `src/engine` | 依赖图、拓扑求值、几何算法、EPSILON | 知道 SVG（Rule 3） |
| `src/layout` | bbox（含 arc 极值角）、无限线裁剪、自动 viewport | 解析 DSL |
| `src/render/svg` | 渲染顺序 §39、样式合并、Y 翻转（§41）、XML escape、确定性输出 | 读 AST/算几何（Rule 4） |
| `src/compiler.js` | `compile(source)`：lex→parse→analyze→buildIR→evaluate→layout | — |
| `src/index.js` | 公开导出 | — |
| `cli/` | 唯一允许 `node:` fs API 的位置（Rule 10）；手写参数解析，无 CLI 框架 | — |

核心内部约定：
- AST 不保存计算结果（Rule 5）；IR 保存 construction definition 与叶子点依赖（Rule 6，§19）
- 所有 sugar（`AB`/`ABC`/`*`/`mid`）在 semantic 期 canonicalize（Rule 7、§50）；`AB*CD` 与 `intersect(segment(A,B),segment(C,D))` 必须产出深比较相等的 IR（§51，作为强测试）
- 错误基类统一携带 `{name, message, line, column, offset}`，六个子类按 §48 归类表；CLI 打印源码行 + caret

---

## 4. 里程碑计划

单主线开发，里程碑间串行依赖；总估算 ~19.5 人日（见 §8）。

### M0 项目骨架（0.5d）
- package.json（`type: module`、`test: node --test`、`bin`、engines ≥22）；目录树按 §44
- 占位 index.js 导出 + 1 个冒烟测试
- **验收**：`npm test` 绿

### M1 Lexer（1.5d）
- `token.js`：Token 类型 + Position
- `lexer.js`：单遍扫描。identifier `[A-Za-z_][A-Za-z0-9_]*`；**无符号**数字（含 `1e3`、`2.5e-4`）；字符串（D10）；颜色 `#RGB`/`#RRGGBB`；10 个符号；块注释不嵌套、未闭合 → SyntaxError 并注明起始行；`//` → SyntaxError 保留提示（§12）
- **验收**：§62 lexer 全部 token 断言（≥40 例）；错误均带 line/column/offset

### M2 Parser + AST（2.5d）
- `ast.js`：§15 全部节点（含 Canvas/Style/Label/Mark/GeometryRef 语句节点）
- `precedence.js`：`^`(右结合) > 一元`-` > `* /` > `+ -`（左结合）
- `parser.js`：Pratt；statement 分发——标识符后跟 `=` → 赋值；`canvas/view`+`{` → canvas；`style`+selector+`{`；`label`+点名；`mark`+kind`(`；其余 `[A-Z]+` → 裸引用语句
- 关键点：`(` 后按逗号数区分分组与 point_literal；`*` 一律产出 BinaryExpr（消歧留给 semantic）；`AB = ...` 语法层接受
- **验收**：§62 parser 清单 AST 断言（≥50 例）；优先级/结合性/一元负号/`(expr)` vs `(expr,expr)` 用例

### M3 Semantic Analysis（2.5d）
- `types.js`：9 个类型 + 兼容规则
- `functions.js`：28 primitives 注册表（名称/别名/参数签名/返回类型；求值器引用可先挂空，M4/M6 填充）
- `analyzer.js` 三阶段：
  1. **收集**：全部顶层绑定（顺序无关 §7.2）；重定义 → NameError；单大写名绑定非 Point → TypeError；对隐式形式赋值 → NameError（§59）；canvas 块 >1 → ArgumentError
  2. **解析与检查**：引用存在性（NameError）；表达式类型推断与检查（geometry 只允许 `*`；混用 Number/geometry → TypeError，§11.1）；intersect 第三参字面量检查（D13）；style selector 须为类型名或已存在对象名（NameError）；label 目标须为已定义点；mark 参数个数与类型（按 4 种 kind 签名）
  3. **Desugar + 建 IR**（§50）：`AB`→segment(A,B)、`ABC`→polygon、`*`→intersect、`mid`→midpoint；裸引用语句物化为具名对象（名 = 拼写，幂等，`AB`≠`BA`，§7.1）；表达式位置引用不物化、若同名已物化则依赖之；definition 记录叶子点依赖与 source position
- **验收**：§63 全部用例 + §51 canonical 等价深比较 + 顺序无关用例（≥60 例）

### M4 IR + 依赖图 + 引擎核心（2.5d）
- `ir/geometry.js`：Point/Vector/Line(point+direction)/Segment/Ray/Circle/Arc(D14)/Polygon/Polyline
- `engine/dependency.js`：邻接表 → DFS 环检测（DependencyError: cyclic dependency detected）→ 稳定拓扑排序（D7）
- `engine/evaluate.js` + 求值器：point literal、line/segment/ray/circle/polygon/polyline 构造与退化检查（零长段、零方向、零半径、重复顶点）、midpoint、intersect（§25 矩阵 + §26：x 主 y 次 epsilon 排序；平行/共线重叠/不相交/无实交点 → GeometryError；矩阵外组合含 Ray/Arc/Polygon → ArgumentError）
- **验收**：§64 前半（mid、line-line、seg-seg、line-circle 0/1/2、circle-circle 0/1/2、相切取 2 → GeometryError、投影、垂线、平行线、排序用例）；循环依赖用例

### M5 Layout + SVG Renderer（2d）——垂直切片集成点
- `layout/bounds.js`：Point/Segment/Circle/Arc（扫 0、π/2、π、3π/2 极值角入集）/Polygon bbox；Line/Ray 用 Liang–Barsky 裁剪（D15）
- `layout/viewport.js`：§32 六步（bbox → padding → uniform scale → 保比 → 居中）；canvas 显式设置优先
- `render/svg/`：§39 九层渲染顺序；样式解析 default→type→object（§35.1 精确默认值）；Y 翻转仅在此层（§41）；XML escape（§42）；`fmt()` 确定性格式化（D6）；standalone SVG 根元素
- **垂直切片验收（spec §73）**：§53 例子（三角形 + 三中点 + labels）端到端出有效 SVG；golden 断言 width/height/viewBox/元素/deterministic（跑两遍逐字节相等）

### M6 完整 Primitives（2.5d）
- 构造：perpendicular、parallel、perpendicular_bisector、angle_bisector（内角）、projection、translate、rotate（度、逆时针为正，§22#17）、reflect、arc（minor arc + 两类退化：半径不匹配、对径端点 → GeometryError，§28）
- 测量：distance、length（仅 Segment/Arc/Polyline/Polygon）、angle（0..180 度）、area（鞋带公式）、perimeter
- 三角形：centroid、circumcenter（共线 → GeometryError）、circumcircle、incenter、incircle
- **验收**：§64 全部 engine 用例闭合（≥80 例）

### M7 Labels / Marks / Style / Canvas 完整（2d）
- label：默认文本 = 点名、默认偏移 (8,-8) px 屏幕坐标（右/下为正）、自定义文本/偏移（D1）
- marks 4 种绘制几何：right_angle 小正方形（顶点 = 中间参，D8）、equal_length tick、parallel 箭头、equal_angle 匹配弧
- style 属性全集 §35 + 值域校验（cap/join 枚举、dash 数字列表、`fill: none`、label_offset 为 point literal）+ 三级合并；canvas 三属性校验 + 预留 CLI 覆盖注入点
- **验收**：golden：label 偏移与自定义文本、4 种 mark、样式覆盖链（type 级 + 对象级叠加）

### M8 CLI + 文档 + 终验收（1.5d）
- `cli/geometry.js`：render 子命令；`-o/--width/--height/--padding` 覆盖 canvas（§66）；错误按 §48 格式打印（源码行 + `^` 指示列），退出码 1；core 保持无 `node:` 导入（Rule 10）
- examples ≥8：§52/53/54/55/56/57 + §74/§75 两条验收源码
- README + `docs/language.md` 语言参考
- **终验收（DoD）**：§74、§75 两条端到端通过；全部 examples 可 `geometry render x.geo -o out.svg`；`npm test` 全绿；抽查 SVG 为 standalone 且逐字节稳定

---

## 5. 测试策略

| 层 | 方式 | 数量目标 | 对应 spec |
|----|------|---------|-----------|
| lexer | token 流断言 + 错误断言 | ≥40 | §62 |
| parser | AST 结构断言（含快照） | ≥50 | §62 |
| semantic | 类型/错误用例 + canonical 等价深比较 | ≥60 | §63、§51 |
| engine | 数值断言（epsilon）+ 错误用例 | ≥80 | §64 |
| layout | bbox/裁剪/缩放数值断言 | ≥20 | §33 |
| render | golden 全文比较 + XML 校验 + 确定性双跑 | ≥15 | §65 |
| e2e | 两条验收用例 + 全 examples 冒烟 | 2+8 | §74、§75 |

错误测试覆盖 §48 归类表全部条目（每条至少 1 例）。golden 基线入库 `test/render/golden/`，更新需显式 `--update-golden` 式脚本并 review diff。

---

## 6. 错误处理要点

- 基类 GeometryDSLError：`name/message/line/column/offset`；六个子类 SyntaxError/NameError/TypeError/ArgumentError/GeometryError/DependencyError
- 词法/语法错误在 lexer/parser 直接抛（有 position）；语义错误在 analyzer 抛（position 来自 AST）；运行期几何错误（相交为空、退化、索引越界、循环依赖）由 IR definition 携带的 position 回填
- CLI 输出格式：错误名 + 消息 + 源码行 + caret 行（§48 示例样式）

---

## 7. 风险与难点

| 风险 | 应对 |
|------|------|
| `(x)` 分组 vs `(x,y)` 点字面量歧义 | parser 按逗号数一次性判定；单元素恒为分组；专门用例覆盖 |
| 顺序无关 + 前向引用（含 style selector 依赖全体绑定） | 严格两遍：先收集全部绑定，后解析校验（§7.2） |
| 浮点临界（相切、共线、对径点） | 全部判定走 EPSILON（D12）；每个临界情形成对写正/反用例 |
| arc 极值 bbox 与 minor arc 方向选择 | 先写数学推导注释再实现；极值角集合单测 |
| 无限线/射线裁剪 | Liang–Barsky 在 engine 坐标完成，renderer 无裁剪逻辑 |
| 确定性输出被 Map 遍历/格式化破坏 | 固定九层渲染序（§39）+ 层内文档序（D7）+ `fmt()`（D6）；golden 双跑兜底 |
| 隐式引用与标识符冲突用户体验 | `AB = ...` 报错信息明确指引（§59）；`//` 报错提示 v0.2 |
| `^` 与一元 `-` 优先级反直觉（`-2^2 = -4`） | 按 spec 实现并用例固化 |

---

## 8. 排期

| 里程碑 | 人日 | 累计 |
|--------|------|------|
| M0 骨架 | 0.5 | 0.5 |
| M1 Lexer | 1.5 | 2 |
| M2 Parser | 2.5 | 4.5 |
| M3 Semantic | 2.5 | 7 |
| M4 IR+引擎核心 | 2.5 | 9.5 |
| M5 Layout+SVG（垂直切片） | 2 | 11.5 |
| M6 全 Primitives | 2.5 | 14 |
| M7 Labels/Marks/Style | 2 | 16 |
| M8 CLI+文档+验收 | 1.5 | 17.5 |

含 20% buffer ≈ 21 人日，单人约 4 周。可并行点：M3 完成后，M4（引擎）与 M5 前半（bbox/viewport 纯函数）可双人流水分工，压缩至约 2.5 周。

---

## 9. 完成定义（DoD）

1. §74、§75 验收用例端到端通过，SVG 目视正确（直角标记在 E 处、重心 G 可见）
2. `npm test` 全绿；§48 每类错误至少一例；§51 canonical 等价测试通过
3. golden 渲染双跑逐字节一致；SVG 无外部依赖、XML 合法、文本已转义
4. CLI 四个参数覆盖 canvas 生效；错误输出含行号与 caret
5. core（src/）零 `node:` 导入；package.json 零 dependencies
6. README、语言参考、≥8 examples 交付

---

## 10. 待澄清清单（按 D 系列默认执行，如与预期不符在此追加）

- D1 label text+offset 组合（v0.2 候选）
- D2/D3 style 与 label 重复语句的合并语义（spec 未规定，当前取"后写覆盖"）
- D10 未知转义严格报错（备选：原样保留）
- `intersect` 未来关键字索引（top/bottom，§26 预留，不做）
