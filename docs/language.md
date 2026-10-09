# Geometry DSL v0.2 — 语言参考

正文说明与 `docs/spec_v0.1.1.md`（v0.1.1 部分）及 `docs/spec_v0.2.md`（约束部分）的章节号以方括号对应。

## 程序结构

程序是一个语句序列。语句之间顺序无关 [§7.2]：
可以在名称定义之前使用它。每个名称只能被赋值一次。

```geometry
canvas { width: 600  height: 400  padding: 30 }   // 可选，至多一个

A = (0, 0)          // 点定义
ABC                 // 裸引用会渲染几何图形
D = mid(BC)         // 构造
G = AD * BE         // 交点

label A             // 标注
mark right_angle(A, B, C)
style segment { stroke: #333 }
```

注释为 C 风格块注释 `/* ... */`，不支持嵌套。
`//` 自 v0.2 起是平行约束运算符，不再是注释 [spec_v0.2 §1.1]；
`_|_` 是垂直约束运算符，两侧必须留空白 [spec_v0.2 §1.2]。

## 名称 [§5, §58, §59]

- 点名称：单个大写 ASCII 字母（`A`…`Z`）。点名称只能绑定到点。
- 隐式引用（不可赋值）：
  - `A` — 点
  - `AB` — 线段 A→B（`AB` 和 `BA` 是不同的对象）
  - `ABC…` — 按给定顶点顺序构成的多边形
- 其余均为普通标识符，用于非点几何对象
  （`omega = circumcircle(ABC)`）。

## 数字与表达式 [§11]

数字是无符号字面量（`0`、`3.14`、`1e3`、`2.5e-4`）；`-` 是一元运算符。
运算符：`+ - * / ^`，其中 `^` 右结合，优先级高于一元 `-`，
其次是一元 `-`，再是 `* /`，最后 `+ -`。

`*` 按类型消歧：

- `geometry * geometry` → 交点
- `Number * Number` → 乘法
- 几何与数字混用 → TypeError

测量函数返回可用于表达式的 Number：

```geometry
O = circle(A, distance(A, B) / 2)
P = rotate(A, angle(B, C, D) + 30, O)
```

## 基元 [§21–24]

基本：`point(x, y)`、`line(A, B)`、`line(AB)`、`segment(A, B)`、
`ray(A, B)`、`circle(O, r)`、`circle(O, A)`、`arc(O, A, B)`（劣弧）、
`polygon(...)`、`polyline(...)`。

构造：`mid(AB)`/`midpoint(A, B)`、`intersect(g1, g2, index?)`、
`perpendicular(A, l)`、`parallel(A, l)`、`perpendicular_bisector(AB)`、
`angle_bisector(A, B, C)`（内角平分，位于 B）、`projection(A, l)`、
`translate(A, dx, dy)`、`rotate(A, degrees, O)`（逆时针为正）、
`reflect(A, l)`。

测量：`distance(A, B)`、`length(x)`（线段/弧/折线/多边形）、
`angle(A, B, C)`（0..180°）、`area(polygon)`、`perimeter(polygon)`。

三角形：`centroid`、`circumcenter`、`circumcircle`、`incenter`、`incircle`——
接受三个点或三角形多边形引用。

类直线参数（`l`）接受 Line 或 Segment。

## 交点语义 [§25, §26]

支持矩阵（其他组合 → ArgumentError）：
`Line×Line`、`Line×Segment`、`Segment×Line`、`Segment×Segment`、
`Line×Circle`、`Circle×Line`、`Circle×Circle`。

- 平行 / 不相交 / 共线重叠 → GeometryError
- 多个交点时需显式给出 ≥ 1 的无符号整数字面量索引：
  `intersect(c1, c2, 1)` —— 排序为 x 升序，再 y 升序
- 索引超出交点数（相切恰有 1 个交点）→ GeometryError

## 画布、样式、标签与标记 [§30, §34–38]

```geometry
canvas { width: 600  height: 400  padding: 30 }    // 默认 600/400/20
```

样式选择器：种类名（`point line segment ray circle arc polygon polyline`）
或对象名。解析顺序：默认 ← 种类 ← 对象。默认值（§35.1）：
点 r=4 `#222222`；描边 `#222222` 宽 2；标记宽 1.5；标签
斜体衬线 14 号，偏移 (8, -8)。

样式属性：`stroke fill width opacity dash cap join radius font
font_style font_size font_weight label_color label_offset`。
颜色为 `#RGB` / `#RRGGBB`。`fill: none` 禁用填充。
`dash` 是数字列表：`dash: 4 2`。

标签只能作用于点；默认文本为点名称；默认偏移为屏幕空间中的
(8, -8) 像素（右/下为正）。可一次标注多个点（逗号分隔），
文本/偏移（若有）作用于列表中的全部点：

```geometry
label A
label A "顶点 A"
label A offset (-10, -10)
label A "顶点 A" offset (-10, -10)   /* v0.2：文本与偏移可同现 */
label A, B, C
label A, B, C "顶点"
label A, B, C offset (-10, -10)
```

标记只做标注，不改变几何：

```geometry
mark right_angle(A, B, C)      /* B 处的方块 */
mark equal_length(AB, CD)      /* 刻度线 */
mark parallel(AB, CD)          /* 箭头雪佛龙 */
mark equal_angle(A,B,C,D,E,F)  /* 在 B 和 E 处配对的弧 */
```

## 约束 [spec_v0.2 §3–§4]

五种约束语句（ASCII 为规范语法；Unicode `∥`/`⟂`/`∠` 不入词法）：

```geometry
AB // CD                        /* 平行：操作数为 Line / Segment / Ray */
h _|_ AB                        /* 垂直：_|_ 两侧必须留空白 */
A-B-C                           /* B 介于 A、C 之间且三点共线 */
AB = CD                         /* 等长；也支持 AB = 5、AB = <数值式> */
angle(B,A,C) = 2*angle(A,B,C)   /* 角度等式，可写一般数值式 */
```

数值等式的两侧各自 canonicalize 为 Number 表达式，可用的测量函数为
`distance length angle area perimeter`；构造函数（`circle` 等）不能入式。
顶层 SegmentRef 等价于包一层 `length()`；顶层 PolygonRef 出现在 `=` 两侧
是 NameError（隐式引用不可赋值，沿 [§59]）。

两态语义 [spec_v0.2 §4]：

- **断言模式**（无未知点）：求值后逐一校验，违反报
  `GeometryError: constraint violated: <源文本>`。容差按 EPSILON 严格判定
  （平行/垂直用归一化方向向量；等长/等式用相对容差），
  因此示例中的坐标需要全精度字面量。
- **求解模式**（含未知点）：未知点用 `C = ?` 声明（仅限单大写点名），
  坐标由 Levenberg–Marquardt 数值求解器定出（多起点确定性，同源码同输出）。
  系统欠定、矛盾或不收敛分别报 `ConstraintError`
  （`under-constrained (k DOF left)` / `over-constrained or inconsistent` /
  `no convergence after 8 starts`）。冗余但一致的约束组（如正方形
  6 约束 4 未知）可以通过。求解阈值（相对残差 1e-7）比断言宽。

约束不产生任何视觉输出；需要可视化时用 `mark`。

## 错误 [§48, spec_v0.2 §7]

| 情形 | 错误 |
|------|------|
| 注释未闭合、语法错误、`?` 非法位置、`A - B` 缺第三点 | SyntaxError |
| 未定义名称、重复定义、给 `AB`/`ABC` 赋值、未知样式对象 | NameError |
| 点名称绑定到非点、类型不匹配、几何与数字混用、约束操作数类型 | TypeError |
| 不支持的交点组合、缺少交点索引、非法索引、canvas 重复、未知属性 | ArgumentError |
| 平行/无交点、退化几何、索引越界、**断言违反（constraint violated）** | GeometryError |
| 循环依赖 | DependencyError |
| **求解失败：欠定 / 超定或不一致 / 不收敛** | ConstraintError |

## 坐标系 [§31]

引擎使用数学笛卡尔坐标（+Y 向上）。SVG 的 Y 翻转只在渲染器中应用。
画布单位为像素；视口按等比缩放容纳所有几何，居中并保持宽高比 [§32]。
