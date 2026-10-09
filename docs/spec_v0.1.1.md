# Geometry DSL v0.1.1

## JavaScript Implementation Specification

**Status:** Draft v0.1.1
**Supersedes:** docs/spec_v0.1.md
**Target:** JavaScript / ES2022+
**Primary Output:** SVG
**Primary Use Case:** Mathematical geometry diagrams embedded in Markdown
**Implementation Principle:** Mathematical notation first, explicit function syntax second

---

# 0. Changelog v0.1 → v0.1.1

评审勘误与补全，整体架构不变：

1. 注释改为 `/* */`（唯一形式，不嵌套）；`//` 保留给 v0.2 平行运算符；`#` 不再是注释，`#f00` 可直接作为颜色字面量
2. 数字字面量改为无符号；`-` 由 parser 处理为一元运算符
3. 数值表达式采用实用版：Number 之间支持 `+ - * / ^`；`*` 按静态类型消歧（geometry × geometry → intersect，Number × Number → 乘法），混用 → TypeError
4. point_literal 放宽为 `(Number表达式, Number表达式)`
5. 明确裸引用语句的对象命名与幂等性（§7.1）、程序顺序无关性（§7.2）
6. 明确 intersect 支持矩阵、多交点无索引、索引越界等边界语义（§25、§26）
7. 明确 arc 退化情形报错（§28）
8. label 仅支持 Point；删除 `label A at ...`；默认偏移固定 (8, -8)（§37）
9. 补充默认样式表（§35.1）
10. AST 补齐 canvas/style/label/mark 语句节点（§15）
11. 明确错误归类：重定义、重复 canvas、style 未知对象、隐式引用赋值等（§48）
12. rotate 正方向明确为逆时针（§22 #17）

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

## 7.1 裸引用语句的对象命名

上一节针对**表达式位置**的引用。作为独立语句出现的裸引用（`AD`、`ABC`）会在 IR 中物化为一个文档对象：

* 对象名即字面拼写：`AD` → name "AD"，`ABC` → name "ABC"
* 该名字仅用于 style selector、依赖引用等场景，**仍然不是变量**：不能对其赋值（§59）
* 重复书写完全相同的裸引用是幂等的：指向同一对象，不产生重复图形
* `AB` 与 `BA` 视为两个不同对象（不做顶点顺序归一化）

表达式位置的裸引用（如 `G = AD * BE` 中的 `AD`）不物化新对象，仅 desugar 为 `segment(A, D)`；若同名对象已被裸引用语句物化，则依赖该对象。

## 7.2 顺序无关性

程序是声明式的：语句书写顺序不影响语义，canvas/style/label/mark 同样顺序无关。实现上先收集全部顶层绑定，再按 §29 依赖图拓扑求值。

仅以下情形报错：

* 引用未定义的名字 → NameError
* 同一名字赋值两次 → NameError（name already defined）
* 名字首绑定后类型固定：单大写字母名只能绑定 Point，`A = circle(...)` → TypeError

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
Circle × Line     → Point / multiple Points
Circle × Circle   → Point / multiple Points
```

矩阵之外的组合（含 Ray、Arc、Polygon 参与）→ ArgumentError（§25）。

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

v0.1.1 表达式包括：

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

## 11.1 Binary Operators

```text
*    /    +    -    ^
```

语义由 semantic analysis 按操作数静态类型消歧：

```text
geometry * geometry   → intersect(geometry, geometry)
Number   * Number     → 数值乘法
Number   + Number     → 数值加法
Number   - Number     → 数值减法
Number   / Number     → 数值除法
Number   ^ Number     → 幂
```

规则：

* geometry 操作数只允许 `*`，其余运算符用于 geometry → TypeError
* 任一操作数为 geometry、另一为 Number（混用）→ TypeError，如 `A * 2`、`AB + CD`
* `2 * x` 这类纯数值乘法因此天然无歧义，与 `AB * CD` 的相交语义由类型区分

优先级（从高到低）：

```text
^            右结合
- (一元)
* /          左结合
+ -          左结合
```

相交运算链 `AB * CD * EF` 按左结合解析，逐对做类型检查。

## 11.2 Unary Operators

```text
-
```

仅作用于 Number 类型表达式：

```text
-3
-x
-(distance(A, B) / 2)
```

`-A`（Point）→ TypeError。

Number 字面量本身不带符号，lexer 只输出无符号数字；负号一律由 parser 生成 UnaryExpression。

## 11.3 测量函数与数值表达式

测量函数（distance/angle/area/perimeter/length）返回 Number，可直接参与数值表达式：

```text
O = circle(A, distance(A, B) / 2)
P = rotate(A, angle(B, C, D) + 30)
```

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

无符号：

```text
0
1
3.14
0.5
1e3
2.5e-4
```

数字字面量不带符号；`-1` 是 UnaryExpression 应用于 `1`（§11.2）。

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

## Colors

```text
#RGB
#RRGGBB
```

例如：

```text
#f00
#222222
```

`#` 不是注释符号，颜色字面量可直接书写（§35）。

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

## Reserved Tokens

```text
//
_|_
```

`//` 保留给 v0.2 平行运算符（`AB // CD`）。v0.1.1 中 lexer 识别为保留 token，报：

```text
SyntaxError:
"//" is reserved for the parallel operator (planned in v0.2)
```

`_|_` 保留给 v0.2 垂直运算符（`AB _|_ CD`）。由于 `_` 是 identifier 字符（`[A-Za-z_][A-Za-z0-9_]*`），`_|_` 两侧必须留空白：`AB _|_ CD` 合法；`AB_|_CD` 经 maximal munch 会切成 identifier `AB_`、`|`、`_CD`，报：

```text
SyntaxError:
"_|_" is reserved for the perpendicular operator (planned in v0.2);
it must be surrounded by whitespace
```

---

## Comments

唯一注释形式为 C 风格块注释：

```text
/* comment */
```

规则：

* 不嵌套，首个 `*/` 即结束
* 单行、多行、行尾均可
* 未闭合注释 → SyntaxError，错误信息注明注释起始行
* `/*` 与 `*/` 在合法程序中只出现在注释里：不存在 `/` 紧跟 `*` 或 `*` 紧跟 `/` 的合法表达式序列

例如：

```text
A = (0, 0)  /* origin */

/* 三角形 ABC 及其中线 */
B = (6, 0)
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
    = "(" expression "," expression ")" ;

function_call
    = identifier "(" argument_list? ")" ;

argument_list
    = expression ("," expression)* ;

unary_expression
    = "-" expression ;

binary_expression
    = expression binary_operator expression ;

binary_operator
    = "*" | "/" | "+" | "-" | "^" ;

canvas_statement
    = "canvas" "{" property* "}" ;

style_statement
    = "style" selector "{" property* "}" ;

selector
    = type_keyword
    | identifier ;

label_statement
    = "label" point_ref ("," point_ref)* ( string | "offset" point_literal )? ;

mark_statement
    = "mark" identifier "(" argument_list ")" ;

property
    = identifier property_value ;

property_value
    = number
    | color
    | string
    | "none"
    | number_list
    | point_literal ;
```

实际实现建议使用 Pratt parser，而不是严格递归下降实现上述伪 grammar。

补充说明：

* point_literal 的两个表达式必须为 Number 类型（semantic 检查）；`(A, B)` 若 A、B 不是 Number → TypeError
* 单元素括号 `( expression )` 仍是分组；双元素逗号括号是 point literal
* `^` 右结合，其余 binary operator 左结合；优先级见 §11.1
* label_statement 支持逗号分隔多个 point_ref，文本/偏移（若有）作用于全部目标；默认文本为点名，默认偏移为 (8, -8)（§37）

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

其余语句节点：

```javascript
class GeometryRefStmt {
    constructor(reference, position) {
        this.type = "GeometryRefStmt";
        this.reference = reference; // PointRefExpr | SegmentRefExpr | PolygonRefExpr
        this.position = position;
    }
}

class CanvasStmt {
    constructor(properties, position) {
        this.type = "CanvasStmt";
        this.properties = properties; // { width, height, padding }
        this.position = position;
    }
}

class StyleStmt {
    constructor(selector, properties, position) {
        this.type = "StyleStmt";
        this.selector = selector;
        this.properties = properties;
        this.position = position;
    }
}

class LabelStmt {
    constructor(target, text, offset, position) {
        this.type = "LabelStmt";
        this.target = target;  // PointRefExpr
        this.text = text;      // StringExpr | null
        this.offset = offset;  // PointLiteralExpr | null
        this.position = position;
    }
}

class MarkStmt {
    constructor(kind, args, position) {
        this.type = "MarkStmt";
        this.kind = kind;      // "right_angle" | "equal_length" | "parallel" | "equal_angle"
        this.args = args;
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

中间对象引用约定：

* desugar 产生的匿名对象（如 `mid(AB)` 内部的 `segment(A, B)`）不进入 `Document.objects`，仅以内联形式存在于 definition 中（如上例 `segment: "AB"`）
* `dependencies` 只包含叶子点名（如 `["A", "B"]`）
* 裸引用语句物化的对象（§7.1）有正式 name，可被其他 definition 引用

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

正方向为逆时针（数学惯例，与引擎 Cartesian 坐标系一致）；负角度为顺时针，可写 `rotate(A, -30, O)`。

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

完整支持矩阵如下，矩阵之外的组合（含 Ray、Arc、Polygon 参与）一律 ArgumentError: unsupported intersection：

```text
Line    × Line
Line    × Segment
Segment × Line
Segment × Segment
Line    × Circle
Circle  × Line
Circle  × Circle
```

边界情形：

```text
Line × Line 平行                → GeometryError
共线重叠（无穷多交点）             → GeometryError
Segment × Segment 不相交          → GeometryError
Segment × Line 不相交             → GeometryError
Line/Circle × Circle 无交点       → GeometryError
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

v0.1.1 规定：

* 多交点而未提供索引（包括 `*` 写法）→ ArgumentError，要求显式索引
* 索引必须是无符号整数字面量且 ≥ 1，否则 ArgumentError
* 索引超出实际交点数（含相切时取 2）→ GeometryError

ordering 规则：

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
arc radius mismatch: |OA| ≠ |OB|
arc antipodal endpoints: minor arc 不唯一
```

arc(O, A, B) 补充规则：

* |OA| ≠ |OB| → GeometryError（v0.1.1 不取近似半径）
* A、B 为对径点（O 在 AB 上），minor arc 不唯一 → GeometryError

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

canvas 块最多一个；出现多个 → ArgumentError（canvas defined more than once）。

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
font_style
font_size
font_weight
label_color
label_offset
```

值格式：

* 颜色：`#RGB` / `#RRGGBB` 颜色字面量（§12）
* `fill: none` 表示不填充
* `dash`：数字列表（px），如 `dash: 4 2`
* `cap`：`butt` | `round` | `square`
* `join`：`miter` | `round` | `bevel`
* `font`：字符串，如 `font: "serif"`
* `font_style`：`normal` | `italic`
* `font_size`：数字（px）
* `label_offset`：point literal，SVG 屏幕坐标偏移（右/下为正），单位 px

不实现完整 CSS。

## 35.1 默认样式表

确定性渲染（§43）与 golden test 依赖精确默认值：

```text
point             radius: 4, fill: #222222
segment/line/ray  stroke: #222222, width: 2
circle/arc        stroke: #222222, width: 2, fill: none
polygon           stroke: #222222, width: 2, fill: none
polyline          stroke: #222222, width: 2
marks             stroke: #222222, width: 1.5
labels            font: "serif", font_style: italic, font_size: 14,
                  label_color: #222222, label_offset: (8, -8)
```

label 用 italic serif，贴近数学教材排版。

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

selector 校验：

* selector 为类型名（point/line/segment/ray/circle/arc/polygon/polyline）或已存在的对象名（赋值名或 §7.1 裸引用物化名）
* 引用不存在的对象 → NameError

---

# 37. Labels

v0.1.1 中 label 仅支持 Point。

支持：

```text
label A
```

默认文本为点名：

```text
A
```

自定义文本：

```text
label A "顶点 A"
```

自定义偏移：

```text
label A offset (8,-8)
```

例如：

```text
label A offset (-10,-10)
```

规则：

* 默认文本 = 点名；默认偏移 = (8, -8) px（§35.1）
* offset 为 SVG 屏幕坐标偏移，右/下为正
* label 引用未定义的点名 → NameError
* `label A at ...` 形式自 v0.1.1 起移除

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

错误归类约定：

```text
未闭合注释                                SyntaxError
"//" 保留 token                           SyntaxError
引用未定义名字                             NameError
同一名字重复赋值                            NameError
style selector 未知对象                     NameError
对隐式引用（AB/ABC）赋值                    NameError（隐式引用不是变量，§7.1）
点名绑定非 Point / 函数参数类型错误 / 数值与几何混用运算   TypeError
intersect 组合不支持 / 多交点未给索引 / 索引非法 / canvas 块重复    ArgumentError
相交为空（平行/不相交/共线重叠）               GeometryError
交点索引越界                                GeometryError
arc 半径不匹配 / 对径端点                    GeometryError
其他退化几何（§28）                          GeometryError
循环依赖                                   DependencyError
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

检查阶段：parser 按 grammar 接受 `AB = ...`（语法层保持纯净），semantic analysis 发现赋值目标匹配隐式引用形式时报 NameError（§48）。普通赋值目标（`A`、`omega`、`height` 等）不受影响。

---

# 60. Constraint DSL Boundary

v0.1 暂不支持：

```text
AB _|_ CD
AB // CD
AB = CD
A-B-C
angle(A,B,C) = angle(D,E,F)
```

这些属于 constraint language。（ASCII 形式为规范语法，Unicode 记号约定见 §77。)

未来 v0.2 可以加入：

```text
AB _|_ CD
AB // CD
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
AB _|_ CD
```

如果 A/B/C/D 已经有固定坐标，这只是一个验证条件。

但如果：

```text
A = (0,0)
B = (10,0)

C = ?
D = ?
AB _|_ CD
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
1.5e-3
"A"
#f00
/*
*
=
//
```

覆盖：无符号数字、颜色字面量、块注释、`//` 保留 token、未闭合注释报错。

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
UnaryExpr
```

补充测试：

```text
P = point(-1, 2 * 3 + 1)
Q = point(distance(A, B) / 2, 0)
R = rotate(A, -30, O)
```

覆盖：一元负号、数值运算与相交运算的类型消歧、优先级（`^` > 一元 `-` > `* /` > `+ -`）。

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

补充必须测试：

```text
/* 顺序无关：使用先于定义 */
D = mid(AB)
A = (0,0)
B = (1,0)
```

```text
/* 重定义 → NameError */
A = (0,0)
A = (1,0)
```

```text
/* 点名绑定非 Point → TypeError */
A = circle(O, 1)
O = (0,0)
```

```text
/* 对隐式引用赋值 → NameError */
AB = (0,0)
```

```text
/* 数值/几何混用 → TypeError */
A = (0,0)
B = (1,0)
X = A * 2
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

### arc 退化

测试：

* |OA| ≠ |OB| → GeometryError
* 对径端点 → GeometryError

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
* unsigned numbers
* strings
* colors（#RGB / #RRGGBB）
* `/* */` comments（含未闭合检测）
* `//` reserved token
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
* unary minus
* numeric operators `+ - / ^`
* Pratt precedence（`^` > 一元 `-` > `* /` > `+ -`）

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
* numeric operator disambiguation（§11.1）
* redefinition / duplicate canvas checks
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

## Rule 11

`*` 的几何/数值语义由 semantic analysis 按静态类型消歧；engine 收到的 definition 已是 canonical form（§11.1、§50）。

---

# 77. Future Roadmap

## v0.2 — Constraints

加入：

```text
AB _|_ CD
AB // CD
A-B-C
AB = CD
angle(A,B,C) = angle(D,E,F)
```

并开始研究 constraint solver。

记号约定：

* **ASCII 形式为规范语法**。Unicode 字符（`∥`、`⟂`、`∠`）仅作为文档排版别名，不属于语法，不出现在 lexer 中。
* `∥` → `//`；`⟂` → `_|_`，两侧必须留空白（原因见 Reserved Tokens）。
* `∠ABC = ∠DEF` → `angle(A,B,C) = angle(D,E,F)`。角度约束不引入新 token，复用测量函数 `angle(A, B, C)`（返回 Number，§21），天然支持 `angle(A,B,C) = 2*angle(D,E,F)` 等泛化形式。
* `//` 已在 v0.1.1 保留（Reserved Tokens）。

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
