# geometry-dsl

一个面向 2D 几何的声明式 DSL，可编译为独立 SVG。专为嵌入 Markdown 的数学图形设计——可读、可版本控制、贴近教科书中的几何书写方式。

实现 [Geometry DSL 规范 v0.1.1](docs/spec_v0.1.1.md)（另见[开发计划](docs/dev_plan_v0.1.1.md)），
v0.2 扩展约束语句与数值求解（[spec_v0.2](docs/spec_v0.2.md)、[开发计划](docs/dev_plan_v0.2.md)、[求解器调研](docs/solver_notes.md)）。

```geometry
A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(BC)
E = mid(CA)

AD
BE

G = AD * BE

label A
label B
label C
label D
label E
label G
```

## 快速开始

```bash
node ./cli/geometry.js render examples/right_triangle.geo          # SVG 输出到 stdout
node ./cli/geometry.js render examples/right_triangle.geo -o out.svg
node ./cli/geometry.js render example.geo --width 1200 --height 800 --padding 50
node ./cli/geometry.js render example.geo --interactive            # 交互式 SVG（拖拽/hover/选中）
```

作为库使用：

```js
import { compile, renderSVG } from "geometry-dsl";

const document = compile(source);   // 分析 + 求值 + 布局
const svg = renderSVG(document);
```

分层 API：`lex`、`parse`、`analyze`、`compile`、`renderSVG`、`serializeDocument`、
`mount`/`mountAll`（交互运行时）。

## 语言一览

| 构造 | 含义 |
|------|------|
| `A = (0, 0)` | 点（名称为单个大写字母） |
| `AB` | 线段 A→B（裸语句会渲染它） |
| `ABC` | 经过 A、B、C 的多边形 |
| `AB * CD` | 两条线段的交点 |
| `mid(AB)` / `midpoint(A, B)` | 中点 |
| `line(AB)` | 经过 A、B 的直线 |
| `circle(O, r)` / `circle(O, A)` | 按半径 / 按过点作圆 |
| `perpendicular(C, AB)` | 过 C 的垂线 |
| `intersect(c1, c2, 2)` | 两圆的第二个交点 |
| `AB // CD` / `AB _|_ CD` | 平行 / 垂直约束（v0.2） |
| `A-B-C` / `AB = CD` | 介于 / 等长约束（v0.2） |
| `angle(B,A,C) = 2*angle(A,B,C)` | 角度等式约束（v0.2） |
| `C = ?` | 未知点，由数值求解器定坐标（v0.2） |
| `label A "text"` | 点标签（自定义文本 / 偏移，v0.2 起可同现） |
| `mark right_angle(A, B, C)` | 在 B 处的直角方块标记 |
| `style AB { stroke: #f00 }` | 按对象的样式 |
| `canvas { width: 600 height: 400 padding: 30 }` | 视口 |

完整参考：[docs/language.md](docs/language.md)。

## 设计

```
源码 → 词法分析 → 语法分析 → AST → 语义分析 → 几何 IR → 依赖图 → 求值 → 布局 → SVG
```

- 数学记法优先（`AB`、`ABC`、`*`、`mid`），底层为规范函数形式
  （`segment(A,B)`、`polygon(A,B,C)`、`intersect(...)`、`midpoint(...)`）——
  两者产生完全相同的 IR。
- 渲染器只消费几何 IR；从不解析 DSL，也不计算几何。
- 输出确定性：相同输入 → 字节级相同的 SVG（金样测试）。
- 零运行时依赖；Node ≥ 22；核心库可在浏览器运行（仅 `cli/` 使用 fs）。
- **交互式 SVG（v0.3）**：opt-in 渲染选项；静态输出字节不变。拖拽自由点
  后浏览器端复用 `evaluate()`/`layout()` 纯函数重算全图；详见
  [docs/spec_v0.3.md](docs/spec_v0.3.md)。

## 错误

七类错误，均带源码位置：`SyntaxError`、`NameError`、`TypeError`、
`ArgumentError`、`GeometryError`、`DependencyError`、`ConstraintError`
（v0.2 求解失败：欠定 / 超定或不一致 / 不收敛）。CLI 会打印出错的
源码行并用插入符标记。

## 开发

```bash
npm test                 # 全量测试
node scripts/update-golden.js   # 重新生成金样 SVG（请审查 diff）
```

目录结构：`src/`（核心）、`cli/`（仅 Node）、`test/`（镜像核心）、`examples/`。

许可证：MIT。
