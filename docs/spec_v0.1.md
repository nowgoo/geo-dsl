# Geometry DSL v0.1

## JavaScript Implementation Specification

**Status:** Draft v0.1
**Target:** JavaScript / ES2022+
**Primary Output:** SVG
**Primary Use Case:** Mathematical geometry diagrams embedded in Markdown
**Implementation Principle:** Mathematical notation first, explicit function syntax second

---

# 1. Project Overview

Geometry DSL 是一个用于描述二维平面几何图形的声明式语言。

目标不是复制 GeoGebra，而是提供一种：

* 简洁
* 可读
* 可版本控制
* 接近数学教材书写方式
* 可以直接嵌入 Markdown
* 可以生成 SVG
* 不依赖专有 GUI 工具

的几何描述语言。

典型代码：

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

这段代码表达：

> 三角形 ABC，D、E 分别为 BC、CA 的中点，AD、BE 相交于 G。

---

# 2. Design Philosophy

Geometry DSL v0.1 遵循以下原则。

## 2.1 数学记号优先

如果一个几何对象在数学中有自然、简洁的记法，应优先支持该记法。

例如：

```text
A
AB
ABC
AB * CD
```

分别对应：

```text
Point(A)
Segment(A,B)
Polygon(A,B,C)
Intersection(AB,CD)
```

---

## 2.2 显式函数语法仍然存在

数学记号不是所有场景都适合。

因此同时支持：

```text
mid(AB)
```

和：

```text
midpoint(AB)
```

以及：

```text
AB * CD
```

和：

```text
intersect(AB, CD)
```

其中数学记号是推荐写法，函数形式是完整、明确的底层表达。

---

## 2.3 AST 与 Geometry IR 严格分离

架构：

```text
Source -> Lexer -> Parser -> AST -> Semantic Analysis -> Geometry IR -> Dependency Graph -> Geometry Evaluation -> Layout -> SVG Renderer
```

Renderer 不允许：

* 读取 AST
* 解析 DSL
* 执行几何计算
* 处理依赖关系

Renderer 只接受 Geometry IR。

---

# 3. Scope

v0.1 只实现：

* 2D Cartesian geometry
* Point
* Line
* Segment
* Ray
* Circle
* Arc
* Polygon
* Polyline
* 基本几何构造
* 基本几何测量
* Triangle constructions
* Labels
* Geometry marks
* SVG rendering
* 自动 viewport

---

# 4. Explicit Non-Goals

v0.1 不实现：

* 3D geometry
* CAS
* 任意约束求解
* 自动几何证明
* theorem proving
* locus
* animation
* interaction
* function plotting
* conic sections（Circle 除外）
* GeoGebra `.ggb` 直接兼容
* GeoGebra XML runtime dependency
* 完整 constraint solver
* 高级自动布局

未来版本可以加入。

---

# 5. Naming Rules

这是 v0.1 的重要语言规则。

## 5.1 Point

点名必须是**单个 ASCII 大写字母**：

```text
A
B
C
...
Z
```

例如：

```text
A = (0, 0)
B = (4, 0)
C = (2, 3)
```

合法。

以下不是 Point 名：

```text
AA
A1
pointA
abc
P1
```

---

# 6. Implicit Geometry Notation

v0.1 正式支持数学式隐式几何引用。

## 6.1 单个大写字母

```text
A
```

表示：

```text
Point(A)
```

---

## 6.2 两个大写字母

```text
AB
```

表示：

```text
Segment(A, B)
```

即：

> 连接 A、B 的线段。

因此：

```text
AB
```

等价于：

```text
segment(A, B)
```

---

## 6.3 三个或以上大写字母

```text
ABC
```

表示：

```text
Polygon(A, B, C)
```

```text
ABCD
```

表示：

```text
Polygon(A, B, C, D)
```

```text
ABCDE
```

表示：

```text
Polygon(A, B, C, D, E)
```

顶点顺序就是多边形边界顺序。

例如：

```text
A = (0, 0)
B = (6, 0)
C = (5, 3)
D = (1, 3)

ABCD
```

表示四边形 ABCD。

---

# 7. Important Semantic Rule

Implicit geometry reference **不是变量声明**。

例如：

```text
AB
```

不是创建一个名为 `AB` 的独立对象。

它是：

```text
SegmentRef(A, B)
```

在 semantic analysis 阶段解析为：

```text
Segment(A, B)
```

同理：

```text
ABC
```

解析为：

```text
Polygon(A, B, C)
```

这样可以避免：

```text
AB
```

和普通变量命名发生冲突。

---

# 8. Intersection Operator

`*` 是 v0.1 的正式几何运算符。

```text
AB * CD
```

表示：

```text
intersect(AB, CD)
```

例如：

```text
A = (0, 0)
B = (6, 4)
C = (0, 4)
D = (6, 0)

E = AB * CD
```

表示：

> E 是 AB 与 CD 的交点。

---

## 8.1 Explicit form

仍然支持：

```text
E = intersect(AB, CD)
```

两种写法语义完全相同。

---

## 8.2 Intersection result

`intersect()` 的结果类型根据输入确定。

v0.1 支持：

```text
Line × Line       → Point
Line × Segment    → Point
Segment × Line    → Point
Segment × Segment → Point
Line × Circle     → Point / multiple Points
Circle × Circle   → Point / multiple Points
```

对于多个交点，使用索引：

```text
P = intersect(c1, c2, 1)
Q = intersect(c1, c2, 2)
```

或者：

```text
P = c1 * c2
```

仅当结果唯一时推荐使用。

---

# 9. Segment vs Line

一个非常重要的语义规则：

```text
AB
```

默认表示：

```text
Segment(A, B)
```

而不是无限直线。

因此：

```text
AB * CD
```

默认表示**两条线段是否相交**。

如果需要无限延伸的直线：

```text
line(AB)
```

或者：

```text
line(A, B)
```

例如：

```text
E = line(AB) * line(CD)
```

表示两条无限直线的交点。

---

# 10. Midpoint Sugar

支持：

```text
D = mid(AB)
```

作为：

```text
D = midpoint(AB)
```

的语法糖。

完整形式：

```text
D = midpoint(AB)
```

数学化形式：

```text
D = mid(AB)
```

推荐：

```text
D = mid(AB)
```

---

# 11. Expressions

v0.1 表达式包括：

```text
Point
SegmentRef
PolygonRef
Identifier
Number
String
FunctionCall
UnaryExpression
BinaryExpression
```

核心 binary operator：

```text
*
```

目前 `*` 专用于几何相交。

普通数值乘法是否使用 `*`，v0.1 暂不支持，以避免：

```text
AB * CD
```

产生歧义。

未来可以根据类型系统加入：

```text
2 * x
```

这样的数值表达式。

---

# 12. Lexer

Lexer 必须识别：

## Identifiers

```text
[A-Za-z_][A-Za-z0-9_]*
```

但语义分析阶段进一步区分：

```text
[A-Z]
[A-Z]{2}
[A-Z]{3,}
```

为 implicit geometry notation。

---

## Numbers

支持：

```text
0
1
-1
3.14
-0.5
1e3
-2.5e-4
```

---

## Strings

支持：

```text
"A"
"顶点 A"
"Hello"
```

至少支持：

* `\"`
* `\\`
* `\n`

---

## Symbols

至少支持：

```text
(
)
{
}
[
]
,
=
:
*
+
-
/
^
.
```

---

## Comments

使用：

```text
# comment
```

例如：

```text
A = (0, 0)  # origin
```

---

# 13. Concrete Grammar

建议使用 Pratt Parser 处理 expression。

核心 grammar：

```text
program
    = statement* ;

statement
    = assignment
    | geometry_reference_statement
    | canvas_statement
    | style_statement
    | label_statement
    | mark_statement ;

assignment
    = identifier "=" expression ;

geometry_reference_statement
    = implicit_geometry_reference ;

expression
    = primary
    | unary_expression
    | binary_expression ;

primary
    = identifier
    | number
    | string
    | point_literal
    | implicit_geometry_reference
    | function_call
    | "(" expression ")" ;

point_literal
    = "(" number "," number ")" ;

function_call
    = identifier "(" argument_list? ")" ;

argument_list
    = expression ("," expression)* ;

binary_expression
    = expression "*" expression ;
```

实际实现建议使用 Pratt parser，而不是严格递归下降实现上述伪 grammar。

---

# 14. Implicit Reference Lexical Recognition

Parser 不应简单地把所有：

```text
ABC
```

当成普通 identifier。

应根据 identifier 形式判断：

```text
A
```

→ PointRef

```text
AB
```

→ SegmentRef

```text
ABC
```

→ PolygonRef

例如：

```javascript
function classifyIdentifier(name) {
    if (/^[A-Z]$/.test(name)) {
        return "PointRef";
    }

    if (/^[A-Z]{2}$/.test(name)) {
        return "SegmentRef";
    }

    if (/^[A-Z]{3,}$/.test(name)) {
        return "PolygonRef";
    }

    return "Identifier";
}
```

---

# 15. AST

AST 负责表达用户写出来的语言结构。

不要在 AST 阶段计算几何。

推荐结构：

```javascript
class Position {
    constructor(offset, line, column) {
        this.offset = offset;
        this.line = line;
        this.column = column;
    }
}
```

节点：

```javascript
class NumberExpr {
    constructor(value, position) {
        this.type = "NumberExpr";
        this.value = value;
        this.position = position;
    }
}

class StringExpr {
    constructor(value, position) {
        this.type = "StringExpr";
        this.value = value;
        this.position = position;
    }
}

class IdentifierExpr {
    constructor(name, position) {
        this.type = "IdentifierExpr";
        this.name = name;
        this.position = position;
    }
}

class PointLiteralExpr {
    constructor(x, y, position) {
        this.type = "PointLiteralExpr";
        this.x = x;
        this.y = y;
        this.position = position;
    }
}
```

Implicit references：

```javascript
class PointRefExpr {
    constructor(name, position) {
        this.type = "PointRefExpr";
        this.name = name;
        this.position = position;
    }
}

class SegmentRefExpr {
    constructor(from, to, position) {
        this.type = "SegmentRefExpr";
        this.from = from;
        this.to = to;
        this.position = position;
    }
}

class PolygonRefExpr {
    constructor(points, position) {
        this.type = "PolygonRefExpr";
        this.points = points;
        this.position = position;
    }
}
```

Function call：

```javascript
class CallExpr {
    constructor(name, args, position) {
        this.type = "CallExpr";
        this.name = name;
        this.args = args;
        this.position = position;
    }
}
```

Binary expression：

```javascript
class BinaryExpr {
    constructor(operator, left, right, position) {
        this.type = "BinaryExpr";
        this.operator = operator;
        this.left = left;
        this.right = right;
        this.position = position;
    }
}
```

Assignment：

```javascript
class AssignmentStmt {
    constructor(name, expression, position) {
        this.type = "AssignmentStmt";
        this.name = name;
        this.expression = expression;
        this.position = position;
    }
}
```

---

# 16. Semantic Type System

v0.1 类型：

```text
Point
Line
Segment
Ray
Circle
Arc
Polygon
Polyline
Number
String
```

Semantic analyzer 必须进行类型检查。

例如：

```text
D = midpoint(c)
```

如果 `c` 是 Circle：

```text
TypeError:
argument 1 of midpoint() must be Segment or Point pair,
got Circle
```

---

# 17. Geometry IR

AST 不应该直接进入 Renderer。

Geometry IR：

```javascript
class Document {
    constructor() {
        this.objects = new Map();
        this.styles = new Map();
        this.canvas = new Canvas();
        this.labels = [];
        this.marks = [];
    }
}
```

Object：

```javascript
class GeometryObject {
    constructor({
        id,
        name,
        kind,
        definition,
        dependencies = [],
        geometry = null,
        style = null
    }) {
        this.id = id;
        this.name = name;
        this.kind = kind;
        this.definition = definition;
        this.dependencies = dependencies;
        this.geometry = geometry;
        this.style = style;
    }
}
```

Object kinds：

```text
Point
Line
Segment
Ray
Circle
Arc
Polygon
Polyline
```

---

# 18. Geometry Structures

## Point

```javascript
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}
```

## Vector

```javascript
class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}
```

## Line

建议使用：

```text
point + direction
```

而不是 slope/intercept。

```javascript
class Line {
    constructor(point, direction) {
        this.point = point;
        this.direction = direction;
    }
}
```

---

## Segment

```javascript
class Segment {
    constructor(a, b) {
        this.a = a;
        this.b = b;
    }
}
```

---

## Ray

```javascript
class Ray {
    constructor(origin, direction) {
        this.origin = origin;
        this.direction = direction;
    }
}
```

---

## Circle

```javascript
class Circle {
    constructor(center, radius) {
        this.center = center;
        this.radius = radius;
    }
}
```

---

## Arc

```javascript
class Arc {
    constructor(center, radius, startAngle, endAngle) {
        this.center = center;
        this.radius = radius;
        this.startAngle = startAngle;
        this.endAngle = endAngle;
    }
}
```

---

## Polygon

```javascript
class Polygon {
    constructor(points) {
        this.points = points;
    }
}
```

---

# 19. Definitions

Geometry object 必须保留 construction definition。

例如：

```text
D = mid(AB)
```

IR：

```javascript
{
    id: "D",
    kind: "Point",
    definition: {
        type: "MidpointDefinition",
        segment: "AB"
    },
    dependencies: ["A", "B"]
}
```

而不是只保存：

```javascript
{
    x: 3,
    y: 0
}
```

这样未来可以：

* 重新计算
* 修改输入
* 做 dependency tracking
* 实现 interactive editing
* 导出 construction
* 实现 GeoGebra importer

---

# 20. Definitions

至少支持：

```text
PointLiteralDefinition
MidpointDefinition
LineDefinition
SegmentDefinition
RayDefinition
CircleDefinition
ArcDefinition
IntersectionDefinition
ParallelDefinition
PerpendicularDefinition
ProjectionDefinition
TranslationDefinition
RotationDefinition
ReflectionDefinition
PolygonDefinition
```

---

# 21. Primitive Functions

v0.1 至少实现以下 28 个 primitives。

## Basic Geometry

### 1. point

```text
point(x, y)
```

### 2. line

```text
line(A, B)
line(AB)
```

### 3. segment

```text
segment(A, B)
```

### 4. ray

```text
ray(A, B)
```

### 5. circle

```text
circle(O, r)
circle(O, A)
```

第二种表示：

> 圆心 O，经过 A。

### 6. arc

```text
arc(O, A, B)
```

表示：

> 圆心 O，从 A 到 B 的圆弧。

默认选择 minor arc。

### 7. polygon

```text
polygon(A, B, C)
polygon(A, B, C, D)
```

### 8. polyline

```text
polyline(A, B, C)
```

---

# 22. Construction Functions

### 9. midpoint

```text
midpoint(AB)
midpoint(A, B)
```

推荐：

```text
mid(AB)
```

---

### 10. intersect

```text
intersect(AB, CD)
```

推荐：

```text
AB * CD
```

---

### 11. perpendicular

```text
perpendicular(A, l)
```

表示过 A 作 l 的垂线。

---

### 12. parallel

```text
parallel(A, l)
```

表示过 A 作 l 的平行线。

---

### 13. perpendicular_bisector

```text
perpendicular_bisector(AB)
```

---

### 14. angle_bisector

```text
angle_bisector(A, B, C)
```

表示 ∠ABC 的内部角平分线。

---

### 15. projection

```text
projection(A, l)
```

表示 A 在 l 上的垂足。

---

### 16. translate

```text
translate(A, dx, dy)
```

v0.1 只支持 Point。

---

### 17. rotate

```text
rotate(A, angle, O)
```

角度单位为 degrees。

---

### 18. reflect

```text
reflect(A, l)
```

表示 A 关于 l 的镜像点。

---

# 23. Measurement Functions

### 19. distance

```text
distance(A, B)
```

返回 Number。

---

### 20. length

```text
length(AB)
```

v0.1 只支持有限几何对象：

```text
Segment
Arc
Polyline
Polygon
```

不支持：

```text
Line
Ray
```

---

### 21. angle

```text
angle(A, B, C)
```

返回：

```text
0 <= angle <= 180
```

单位 degrees。

---

### 22. area

```text
area(ABC)
area(ABCD)
```

---

### 23. perimeter

```text
perimeter(ABC)
```

---

# 24. Triangle Functions

### 24. centroid

```text
centroid(ABC)
```

---

### 25. circumcenter

```text
circumcenter(ABC)
```

---

### 26. circumcircle

```text
circumcircle(ABC)
```

---

### 27. incenter

```text
incenter(ABC)
```

---

### 28. incircle

```text
incircle(ABC)
```

---

# 25. Intersection Semantics

Intersection 是核心 primitive。

支持：

```text
Line × Line
Line × Segment
Segment × Line
Segment × Segment
Line × Circle
Circle × Line
Circle × Circle
```

Circle intersections：

```text
0 intersections
1 intersection
2 intersections
```

必须区分：

```text
no intersection
tangent
two intersections
```

---

# 26. Multiple Intersection Ordering

当两个对象有多个交点：

```text
P = intersect(c1, c2, 1)
Q = intersect(c1, c2, 2)
```

必须有 deterministic ordering。

v0.1 建议：

1. 按 x 从小到大
2. x 相同则按 y 从小到大

即：

```text
(x1 < x2)
||
(x1 === x2 && y1 < y2)
```

使用 epsilon 比较，而不是直接 `===`。

未来可以增加：

```text
intersect(c1, c2, top)
intersect(c1, c2, bottom)
```

等语法。

---

# 27. Numeric Policy

使用：

```javascript
Number
```

即 IEEE-754 double precision。

全局：

```javascript
const EPSILON = 1e-9;
```

不要对计算结果使用：

```javascript
a === b
```

应使用：

```javascript
Math.abs(a - b) < EPSILON
```

几何计算需要统一使用 tolerance。

---

# 28. Degenerate Geometry

必须检测：

```text
zero-length segment
zero-length line direction
zero-radius circle
duplicate polygon vertices
collinear triangle for circumcenter
degenerate angle
invalid intersection
```

例如：

```text
A = (0,0)
B = (0,0)

AB
```

应产生：

```text
GeometryError:
cannot construct segment AB:
points A and B are coincident
```

---

# 29. Dependency Graph

例如：

```text
A = (0,0)
B = (6,0)
C = (2,4)

D = mid(BC)
E = mid(CA)
G = AD * BE
```

dependency graph：

```text
A ─────┐
       ├── D ──┐
B ─────┘       │
               ├── G
A ─────┐       │
       ├── E ──┘
C ─────┘

A,B,C → AD
A,B,C → BE
```

Evaluation 前必须：

1. 建立 dependency graph
2. 检测 cycle
3. topological sort
4. 按依赖顺序计算

循环依赖：

```text
A = mid(BC)
B = mid(AC)
C = mid(AB)
```

必须报：

```text
DependencyError:
cyclic dependency detected
```

---

# 30. Canvas

支持：

```text
canvas {
    width: 600
    height: 400
    padding: 30
}
```

默认：

```text
width  = 600
height = 400
padding = 20
```

Canvas 属性：

```text
width
height
padding
```

建议支持：

```text
view {
    x: ...
    y: ...
    width: ...
    height: ...
}
```

但 `view` 可以作为 v0.1 optional feature。

---

# 31. Coordinate System

Geometry engine 使用数学 Cartesian coordinate system：

```text
          +Y
           ↑
           |
           |
-X ←───────+──────→ +X
           |
           |
           ↓
          -Y
```

SVG 的 Y 轴反向问题由 renderer 处理。

Engine 永远不应该知道 SVG 坐标。

---

# 32. Automatic Layout

如果用户没有指定 viewport：

1. 计算所有 visible geometry 的 bounding box
2. 加 padding
3. 计算 uniform scale
4. 保持 aspect ratio
5. 居中
6. 转换到 SVG viewport

例如：

```text
geometry bounds:
x = 0..6
y = 0..4
```

Canvas：

```text
600 × 400
```

自动计算：

```text
scale = min(scaleX, scaleY)
```

保证：

```text
circle remains circle
square remains square
```

---

# 33. Bounding Box

必须正确计算：

### Point

```text
(x,y)
```

### Segment

两个端点。

### Polygon

所有顶点。

### Circle

```text
(cx-r, cy-r)
(cx+r, cy+r)
```

### Arc

不能只计算：

```text
start point
end point
```

必须考虑 arc 中经过的极值角。

### Line / Ray

因为无限延伸，不能直接使用普通 finite bounding box。

Renderer/layout 应将其裁剪到 viewport。

---

# 34. Style System

v0.1 使用简化 CSS-like syntax。

例如：

```text
style point {
    radius: 4
    fill: #222
}

style line {
    stroke: #222
    width: 2
}

style AB {
    stroke: #f00
    width: 3
}
```

支持 selector：

```text
point
line
segment
circle
polygon
AB
ABC
```

---

# 35. Style Properties

至少支持：

```text
stroke
fill
width
opacity
dash
cap
join
radius
font
font_size
font_weight
label_color
label_offset
```

不实现完整 CSS。

---

# 36. Style Precedence

建议：

```text
default
  ↓
type style
  ↓
object style
  ↓
inline/future override
```

例如：

```text
style segment {
    stroke: #333
    width: 2
}

style AB {
    stroke: #f00
}
```

AB 最终：

```text
stroke = #f00
width  = 2
```

---

# 37. Labels

支持：

```text
label A
```

默认显示：

```text
A
```

支持：

```text
label A "顶点 A"
```

以及：

```text
label A at A
```

以及：

```text
label A offset (8,-8)
```

例如：

```text
label A offset (-10,-10)
```

---

# 38. Marks

Marks 是数学图形注释，不修改 geometry。

支持：

```text
mark right_angle(A, B, C)
```

```text
mark equal_length(AB, BC)
```

```text
mark parallel(AB, CD)
```

```text
mark equal_angle(A,B,C,D,E,F)
```

v0.1：

### right_angle

画小正方形。

### equal_length

画 tick marks。

### parallel

画匹配箭头。

### equal_angle

画匹配 arc。

---

# 39. Rendering Order

SVG rendering order：

```text
1. polygon fills
2. circles / arcs
3. lines
4. segments
5. rays
6. polygon outlines
7. points
8. marks
9. labels
```

确保：

* fill 不覆盖 geometry
* points 在 lines 上方
* labels 在最上方

---

# 40. SVG Renderer

接口：

```javascript
class SVGRenderer {
    render(document, writer) {
        // ...
    }
}
```

也可以提供：

```javascript
function renderSVG(document) {
    return "...";
}
```

第一版推荐后者，方便 CLI 和 Markdown integration。

输出必须是 standalone SVG：

```xml
<svg
    xmlns="http://www.w3.org/2000/svg"
    width="600"
    height="400"
    viewBox="0 0 600 400">
</svg>
```

---

# 41. SVG Coordinate Transform

Geometry：

```text
(x, y)
```

转换到 SVG：

```text
svgX = ...
svgY = canvasHeight - ...
```

所有 transform 应集中在 renderer/layout layer。

不要在 geometry engine 中反转 Y。

---

# 42. SVG Safety

Label 和其他文本必须 XML escape。

例如：

```text
<
>
&
"
'
```

不能直接写入 SVG。

---

# 43. Deterministic Rendering

相同输入必须生成稳定 SVG。

不要依赖：

* Map iteration order
* random IDs
* 当前时间
* random layout

这样方便：

* git diff
* snapshot testing
* golden tests
* Markdown cache

---

# 44. JavaScript Project Structure

推荐：

```text
geometry/
├── package.json
├── README.md
├── LICENSE
│
├── src/
│   ├── lexer/
│   │   ├── lexer.js
│   │   └── token.js
│   │
│   ├── parser/
│   │   ├── parser.js
│   │   ├── ast.js
│   │   └── precedence.js
│   │
│   ├── semantic/
│   │   ├── analyzer.js
│   │   ├── types.js
│   │   └── functions.js
│   │
│   ├── ir/
│   │   ├── document.js
│   │   ├── object.js
│   │   ├── geometry.js
│   │   ├── definitions.js
│   │   └── style.js
│   │
│   ├── engine/
│   │   ├── engine.js
│   │   ├── dependency.js
│   │   ├── evaluate.js
│   │   ├── point.js
│   │   ├── line.js
│   │   ├── segment.js
│   │   ├── circle.js
│   │   ├── polygon.js
│   │   ├── intersection.js
│   │   └── triangle.js
│   │
│   ├── layout/
│   │   ├── viewport.js
│   │   └── bounds.js
│   │
│   ├── render/
│   │   └── svg/
│   │       ├── renderer.js
│   │       ├── geometry.js
│   │       ├── labels.js
│   │       └── marks.js
│   │
│   ├── compiler.js
│   └── index.js
│
├── cli/
│   └── geometry.js
│
├── examples/
│   ├── triangle.geo
│   ├── circle.geo
│   ├── right_triangle.geo
│   ├── midpoint.geo
│   └── intersection.geo
│
└── test/
    ├── lexer/
    ├── parser/
    ├── semantic/
    ├── engine/
    ├── layout/
    └── render/
```

---

# 45. package.json

使用标准 JavaScript。

推荐：

```json
{
  "name": "geometry-dsl",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "geometry": "./cli/geometry.js"
  },
  "scripts": {
    "test": "node --test",
    "cli": "node ./cli/geometry.js"
  },
  "engines": {
    "node": ">=22"
  }
}
```

v0.1 不要求 TypeScript。

也不要求 Babel。

也不要求 bundler。

---

# 46. Public API

核心 API：

```javascript
import { compile } from "geometry-dsl";

const document = compile(`
A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(BC)
E = mid(CA)

AD
BE

G = AD * BE
`);

const svg = document.renderSVG();
```

更推荐分层 API：

```javascript
import {
    parse,
    compile,
    renderSVG
} from "geometry-dsl";
```

例如：

```javascript
const ast = parse(source);
const document = compile(ast);
const svg = renderSVG(document);
```

同时提供：

```javascript
compile(source)
```

作为 convenience API。

---

# 47. Compiler Pipeline

推荐：

```javascript
function compile(source) {
    const tokens = lex(source);

    const ast = parse(tokens);

    const semanticDocument = analyze(ast);

    const ir = buildIR(semanticDocument);

    evaluate(ir);

    layout(ir);

    return ir;
}
```

注意：

`compile()` 返回的 IR 已经完成：

* semantic analysis
* dependency resolution
* geometry evaluation
* layout

Renderer 可以直接使用。

---

# 48. Error Model

至少定义：

```text
SyntaxError
NameError
TypeError
ArgumentError
GeometryError
DependencyError
```

错误必须包含：

```javascript
{
    name,
    message,
    line,
    column,
    offset
}
```

例如：

```text
GeometryError:
cannot construct intersection of segments AB and CD:
segments do not intersect

  12 | E = AB * CD
                 ^
```

---

# 49. Function Registry

不要在 semantic analyzer 中写巨大 switch。

推荐：

```javascript
const functions = new Map();

functions.set("mid", {
    aliases: ["midpoint"],
    args: ["Segment"],
    returns: "Point",
    evaluate: evaluateMidpoint
});
```

例如：

```javascript
functions.set("intersect", {
    aliases: [],
    args: ["Geometry", "Geometry"],
    returns: "Point",
    evaluate: evaluateIntersection
});
```

这样以后增加：

```text
orthocenter
nine_point_center
tangent
```

不需要修改 parser。

---

# 50. Sugar Desugaring

所有 syntax sugar 应尽可能在 semantic phase 转换成 canonical form。

例如：

```text
AB
```

转换：

```text
segment(A, B)
```

```text
ABC
```

转换：

```text
polygon(A, B, C)
```

```text
mid(AB)
```

转换：

```text
midpoint(segment(A,B))
```

```text
AB * CD
```

转换：

```text
intersect(segment(A,B), segment(C,D))
```

这样后续 IR / engine 不需要知道：

```text
AB
ABC
*
mid
```

这些 syntax sugar 的存在。

---

# 51. Canonical IR Principle

例如：

```text
E = AB * CD
```

和：

```text
E = intersect(segment(A,B), segment(C,D))
```

必须生成完全等价的 IR。

这是一个重要测试要求：

```text
compile(
    "E = AB * CD"
)
```

与：

```text
compile(
    "E = intersect(segment(A,B), segment(C,D))"
)
```

应产生相同的 Geometry Definition。

---

# 52. Example 1 — Basic Triangle

```geometry
A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

label A
label B
label C
```

---

# 53. Example 2 — Midpoints

```geometry
A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(BC)
E = mid(CA)
F = mid(AB)

label A
label B
label C
label D
label E
label F
```

---

# 54. Example 3 — Medians

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

---

# 55. Example 4 — Circle Intersection

```geometry
A = (0, 0)
B = (4, 0)

c1 = circle(A, B)
c2 = circle(B, A)

P = intersect(c1, c2, 1)
Q = intersect(c1, c2, 2)

label A
label B
label P
label Q
```

注意：这里 `c1`、`c2` 是普通 identifier，不是 Point。

因此 v0.1 明确允许：

```text
lowercase identifiers
```

作为非 Point geometry objects 的名称。

---

# 56. Example 5 — Right Triangle

```geometry
canvas {
    width: 600
    height: 400
    padding: 30
}

A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(AB)

h = perpendicular(C, AB)
E = h * AB

label A
label B
label C
label D
label E

mark right_angle(C, E, B)
```

注意这里特意使用：

```text
C = (2,4)
```

而不是 `(0,4)`。

这样垂线 `h` 与 `AB` 的交点 E 不会与 A 重合。

---

# 57. Example 6 — Circumcircle

```geometry
A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

O = circumcenter(ABC)
omega = circumcircle(ABC)

label A
label B
label C
label O

style omega {
    stroke: #555
    fill: none
    width: 2
}
```

---

# 58. Point Naming vs Object Naming

这是语言设计中必须明确的一点。

### Point

严格：

```text
A-Z
```

### Other objects

可以使用普通 identifier：

```text
omega
circle1
height
median
```

例如：

```text
O = circumcenter(ABC)
omega = circumcircle(ABC)
```

其中：

```text
O
```

是 Point。

```text
omega
```

是 Circle。

因此：

```text
O = ...
omega = ...
```

是合法的。

---

# 59. Ambiguity Rule

如果普通 identifier 和 implicit notation 冲突：

```text
AB
```

永远解释成：

```text
SegmentRef(A,B)
```

不能声明：

```text
AB = ...
```

作为普通变量。

这是为了保证：

```text
AB
ABC
AB * CD
```

永远具有确定的数学含义。

---

# 60. Constraint DSL Boundary

v0.1 暂不支持：

```text
AB ⟂ CD
AB ∥ CD
AB = CD
A-B-C
∠ABC = ∠DEF
```

这些属于 constraint language。

未来 v0.2 可以加入：

```text
AB ⟂ CD
AB ∥ CD
```

以及：

```text
A-B-C
```

等约束。

v0.1 的核心是：

> **Construction DSL，而不是 Constraint Solver。**

---

# 61. Why Not Implement Constraints in v0.1

例如：

```text
AB ⟂ CD
```

如果 A/B/C/D 已经有固定坐标，这只是一个验证条件。

但如果：

```text
A = (0,0)
B = (10,0)

C = ?
D = ?
AB ⟂ CD
```

那么语言就需要：

* unknown variables
* constraint graph
* numerical solver
* degrees of freedom
* under/over-constrained detection

这会大幅增加实现复杂度。

因此 v0.1 明确避免。

---

# 62. Tests

## Lexer

测试：

```text
A
AB
ABC
foo
123
3.14
-1.5
"A"
*
=
```

---

## Parser

测试：

```text
A = (0,0)
B = (1,0)

AB
ABC

E = AB * CD

D = mid(AB)
```

确保 AST 正确区分：

```text
PointRef
SegmentRef
PolygonRef
BinaryExpr
CallExpr
```

---

# 63. Semantic Tests

必须测试：

```text
A = (0,0)
B = (1,0)

D = mid(AB)
```

以及：

```text
A = (0,0)
B = (1,0)
C = (0,1)

ABC
```

以及：

```text
E = AB * CD
```

以及错误：

```text
A = (0,0)
D = mid(A)
```

---

# 64. Engine Tests

至少测试：

### midpoint

```text
mid((0,0),(4,0)) = (2,0)
```

### line-line intersection

### segment-segment intersection

### line-circle intersection

测试：

* no intersection
* tangent
* two intersections

### circle-circle intersection

### projection

### perpendicular

### parallel

### circumcenter

### incenter

### centroid

---

# 65. SVG Tests

SVG 测试采用 golden / snapshot 思路。

输入：

```text
A = (0,0)
B = (4,0)
AB
```

检查：

* valid XML
* width
* height
* viewBox
* line/segment path
* point rendering
* deterministic output

---

# 66. CLI

CLI：

```bash
geometry render input.geo
```

默认输出 stdout。

或者：

```bash
geometry render input.geo -o output.svg
```

支持：

```text
-o
--output

--width
--height
--padding
```

命令行参数覆盖 DSL 中的 canvas 设置。

例如：

```bash
geometry render triangle.geo \
    --width 1200 \
    --height 800 \
    --padding 50
```

---

# 67. CLI Implementation

使用 Node.js 内置 API。

v0.1 不要求第三方 CLI framework。

例如：

```javascript
#!/usr/bin/env node

import fs from "node:fs";
import { compile, renderSVG } from "../src/index.js";

const source = fs.readFileSync(input, "utf8");

const document = compile(source);

const svg = renderSVG(document);

process.stdout.write(svg);
```

---

# 68. No Runtime Dependencies

v0.1 尽可能只使用 Node.js standard library。

不依赖：

* React
* Vue
* D3
* SVG libraries
* geometry libraries
* TypeScript
* Babel
* bundler

几何算法自行实现。

这可以保持核心库：

```text
small
portable
auditable
embeddable
```

---

# 69. Browser Support

核心库应尽量避免 Node-specific API。

理想架构：

```text
@geometry/core
```

可以直接运行在：

```text
Node.js
Browser
Deno
Bun
```

Node-specific 功能只放在：

```text
cli/
```

这样未来可以直接：

```javascript
import { compile, renderSVG } from "geometry-dsl";
```

在浏览器 Markdown renderer 中使用。

---

# 70. Markdown Integration

Markdown integration 不属于 core v0.1。

未来可以：

````markdown
```geometry
A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(BC)
````

````

Markdown plugin：

```text
Markdown
   ↓
geometry code block
   ↓
Geometry DSL
   ↓
SVG
````

最终：

```html
<svg>...</svg>
```

---

# 71. Browser API

未来 Markdown renderer 只需要：

```javascript
const svg = renderGeometry(source);
```

而不是运行 CLI。

因此核心包应该暴露：

```javascript
export {
    lex,
    parse,
    analyze,
    compile,
    renderSVG
};
```

---

# 72. Implementation Order

## Phase 1 — Project Skeleton

完成：

```text
package.json
src/
cli/
test/
examples/
```

确保：

```bash
npm test
```

可运行。

---

## Phase 2 — Lexer

实现：

* identifiers
* numbers
* strings
* comments
* symbols
* source positions

---

## Phase 3 — Parser

实现：

* assignment
* point literal
* function calls
* implicit Point
* implicit Segment
* implicit Polygon
* `*`

重点测试：

```text
A
AB
ABC
AB * CD
```

---

## Phase 4 — AST + Semantic Analysis

实现：

* type system
* symbol table
* point name validation
* implicit notation desugaring
* function registry

---

## Phase 5 — Geometry IR

实现：

* Document
* Object
* Definitions
* Geometry structures
* dependencies

---

## Phase 6 — Basic Geometry Engine

实现：

```text
Point
Line
Segment
Ray
Circle
Arc
Polygon
Polyline
```

---

## Phase 7 — Construction

实现：

```text
midpoint
intersect
perpendicular
parallel
projection
```

---

## Phase 8 — Measurements

实现：

```text
distance
length
angle
area
perimeter
```

---

## Phase 9 — Triangle Geometry

实现：

```text
centroid
circumcenter
circumcircle
incenter
incircle
```

---

## Phase 10 — Dependency Graph

实现：

* dependency extraction
* cycle detection
* topological sorting
* evaluation

---

## Phase 11 — Layout

实现：

* bounding boxes
* circle/arc bounds
* infinite line clipping
* automatic viewport
* aspect ratio preservation

---

## Phase 12 — SVG Renderer

实现：

* SVG root
* geometry
* styles
* coordinate transform
* deterministic output

---

## Phase 13 — Labels / Marks

实现：

* labels
* right angle
* equal length
* parallel
* equal angle

---

## Phase 14 — CLI / Documentation

完成：

```bash
geometry render example.geo
```

以及：

```text
README
language reference
examples
```

---

# 73. First Milestone

第一阶段不需要一次实现全部 28 primitives。

第一个可工作的 milestone：

```text
source
  ↓
lexer
  ↓
parser
  ↓
AST
  ↓
semantic analysis
  ↓
IR
  ↓
Point
Segment
Line
Circle
Polygon
  ↓
midpoint
intersect
  ↓
layout
  ↓
SVG
```

可以运行：

```bash
node ./cli/geometry.js render examples/right_triangle.geo
```

并输出有效 SVG。

---

# 74. Acceptance Test

必须支持：

```geometry
canvas {
    width: 600
    height: 400
    padding: 30
}

A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(AB)

h = perpendicular(C, AB)
E = h * AB

label A
label B
label C
label D
label E

mark right_angle(C, E, B)
```

其中：

```text
h
```

是过 C 的垂线。

```text
E = h * AB
```

是 h 与 AB 的交点。

由于 C 的 x 坐标为 2：

```text
E = (2, 0)
```

不会与 A 重合。

---

# 75. Extended Acceptance Test

必须支持：

```geometry
canvas {
    width: 800
    height: 600
    padding: 40
}

A = (0, 0)
B = (8, 0)
C = (3, 5)

ABC

D = mid(BC)
E = mid(CA)
F = mid(AB)

AD
BE
CF

G = AD * BE

label A
label B
label C
label D
label E
label F
label G

mark equal_length(AF, FB)
mark equal_length(BD, DC)
mark equal_length(CE, EA)
```

这应该渲染一个完整的三角形、中线以及重心 G。

---

# 76. Architecture Constraints

Codex 实现时必须遵守：

## Rule 1

Parser 不做 geometry calculation。

## Rule 2

Semantic analyzer 不输出 SVG。

## Rule 3

Engine 不知道 SVG。

## Rule 4

Renderer 不解析 DSL。

## Rule 5

AST 不保存计算后的 geometry。

## Rule 6

Geometry IR 保存 construction definition。

## Rule 7

所有 syntax sugar 在 semantic phase canonicalize。

## Rule 8

Geometry calculation 使用统一 EPSILON。

## Rule 9

所有输出必须 deterministic。

## Rule 10

Node-specific functionality 与 core 分离。

---

# 77. Future Roadmap

## v0.2 — Constraints

加入：

```text
AB ⟂ CD
AB ∥ CD
A-B-C
AB = CD
∠ABC = ∠DEF
```

并开始研究 constraint solver。

---

## v0.3 — Interactive SVG

支持：

* drag point
* recomputation
* interactive labels
* hover
* selectable objects

---

## v0.4 — Advanced Geometry

加入：

* orthocenter
* nine-point center
* tangent
* more conics
* advanced marks
* better label placement

---

## v0.5 — GeoGebra Importer

研究：

```text
.ggb -> ZIP -> geogebra.xml -> GeoGebra construction model -> Geometry IR -> Geometry DSL
```

GeoGebra 不作为 runtime dependency。

它只是：

* behavior reference
* importer source format
* geometry semantics reference

---

## v1.0

目标：

* Stable DSL
* JavaScript library
* CLI
* SVG renderer
* Markdown integration
* Browser renderer
* VS Code syntax support

---

# 78. Core Design Example

最终希望用户可以写出接近数学教材的代码：

```geometry
A = (0, 0)
B = (8, 0)
C = (3, 5)

ABC

D = mid(BC)
E = mid(CA)

AD
BE

G = AD * BE

O = circumcenter(ABC)
omega = circumcircle(ABC)

label A
label B
label C
label D
label E
label G
label O

style omega {
    stroke: #888
    fill: none
    width: 1.5
}
```

而底层系统看到的则是一个严格类型化的 geometry construction graph：

```text
Point A
Point B
Point C

Polygon ABC

Point D = Midpoint(B,C)
Point E = Midpoint(C,A)

Line/Segment AD
Line/Segment BE

Point G = Intersection(AD,BE)

Point O = Circumcenter(A,B,C)
Circle omega = Circumcircle(A,B,C)
```

这就是 Geometry DSL v0.1 的核心目标：

> **上层接近数学，下层保持严格的计算机语言结构。**

---

# 79. Final Principle

Geometry DSL 不应该追求“用最少的代码画出最多的图形”。

真正的目标是：

> **让数学家/教师看到 DSL 时，感觉自己是在写几何题；让程序员看到 AST/IR 时，感觉自己是在处理一门严谨的编程语言。**

因此 v0.1 的核心 syntax 应优先保证：

```text
A
AB
ABC
AB * CD
mid(AB)
```

这些最常见的数学表达自然、简洁、无歧义。

而：

```text
point(...)
segment(...)
polygon(...)
intersect(...)
midpoint(...)
```

作为完整、显式、机器友好的 canonical representation 保留。

最终形成：

```text
                Human-friendly
                      ↑
                      │
       A  AB  ABC  AB * CD  mid(AB)
                      │
                 Parser / AST
                      │
               Semantic Analysis
                      │
             Canonical Geometry IR
                      │
              Geometry Evaluation
                      │
                   Layout
                      │
                     SVG
                      ↓
                Machine-friendly
```

这是 v0.1 的基本架构原则。
