# Geometry DSL v0.2

## Constraints Specification Addendum

**Status:** Draft v0.2
**Supersedes:** docs/spec_v0.1.1.md（未覆盖部分继续生效）
**Scope:** 约束语句、断言检查、数值求解、DOF 诊断
**Implementation Principle:** ASCII 规范语法；断言与求解共用同一谓词模块

---

# 0. Changelog v0.1.1 → v0.2

1. 新增约束语句：`AB // CD`、`AB _|_ CD`、`A-B-C`、`AB = CD`、`angle(A,B,C) = 2*angle(D,E,F)`（§77 路线图落地）
2. `//`、`_|_` 从保留 token 转为正式运算符 token（v0.1.1 §12 的报错移除）
3. 新增未知点声明 `C = ?`（单大写点名专属）；引入数值求解器与 DOF 诊断
4. 约束两态语义：全定程序 → 断言检查；含未知点 → 数值求解（§61 两分法）
5. 错误归类新增 `ConstraintError`（§48 增补）
6. label 同时支持自定义文本与 offset（v0.1.1 D1 遗留项转正）
7. Unicode 记号 `∥`/`⟂`/`∠` 仍不入 lexer，出现即 `unexpected character`（§77 记号约定不变）

---

# 1. Lexical Additions

## 1.1 `//`（parallel）

`/` 紧跟 `/` 产出 SYMBOL token，text 为 `"//"`。不再有保留报错。

## 1.2 `_|_`（perpendicular）

序列 `_` `|` `_` 且**前后均为空白/行首/行尾**时产出 SYMBOL token，text 为 `"_|_"`。
违反空白规则（如 `AB_|_CD`）→ SyntaxError，保留 v0.1.1 报错文案：

```text
SyntaxError:
"_|_" is reserved for the perpendicular operator (planned in v0.2);
it must be surrounded by whitespace
```

单独的 `|` 仍是 `unexpected character`。

## 1.3 `?`

`?` 加入符号集。仅在未知点声明 `C = ?` 的 RHS 位置合法（§3.3）；其余位置 → SyntaxError。

---

# 2. Concrete Grammar Additions

```text
statement += constraint_statement | betweenness_statement | unknown_assignment ;

unknown_assignment
    = point_name "=" "?" ;          /* point_name = 单个 ASCII 大写字母 */

constraint_statement
    = geometry_ref parallel_op geometry_ref
    | geometry_ref perpendicular_op geometry_ref
    | measurement_expr "=" measurement_expr ;

parallel_op       = "//" ;
perpendicular_op  = "_|_" ;

betweenness_statement
    = point_ref "-" point_ref "-" point_ref ;

measurement_expr
    = Number 表达式（含测量函数调用 distance/length/angle/area/perimeter）；
      顶层允许 SegmentRef（等价于 length(SegmentRef)）
```

Statement 分发规则：

* 单大写 `A` 开头：`A = ?` → unknown_assignment；`A - ...` → betweenness_statement；`A = expr` → assignment
* 双大写 `AB` 开头：句尾 → 裸引用；`=` → 走 assignment 路径（parser 仍产出 `AssignmentStmt`，semantic 依 RHS 重分类，见 §4.1）
* 测量调用/数值式开头：表达式后遇 `=` → constraint_statement
* 任意隐式引用后遇 `//` 或 `_|_` → constraint_statement
* `A - B`（缺第三点）→ SyntaxError

---

# 3. Constraint Statements

## 3.1 平行与垂直

```geometry
AB // CD          /* 线段方向向量平行 */
h _|_ AB          /* h 为 perpendicular(C, AB) 构造出的直线 */
line(AB) // ray(C, D)
```

操作数类型矩阵（TypeError 之外全拒）：

```text
Line × {Line, Segment, Ray}
Segment × {Line, Segment, Ray}
Ray × {Line, Segment, Ray}
```

Segment 参与时取端点方向向量；共线亦判平行（按方向，不区分线段位置）。

## 3.2 介于（Betweenness）

```geometry
A-B-C
```

语义：三点共线**且** B 介于 A、C 之间。判定残差：`|AB| + |BC| − |AC|`（≥ 0，为零当且仅当 B 在 A、C 之间）。

## 3.3 未知点声明

```geometry
C = ?
```

* 仅限单大写点名；`r = ?` → SyntaxError（v0.2 未知量只有 Point）
* `C = (2, ?)` 部分未知、`r = ?` 数值未知 → 不支持
* 未知点可被构造引用（`D = mid(BC)`），依赖图照常工作；坐标由求解器给出
* 未知点必须被至少一条约束约束到；未被约束的未知量在求解后由 DOF 诊断报欠定

## 3.4 等长与角度约束（数值等式）

```geometry
AB = CD                        /* desugar: length(AB) = length(CD) */
AB = 5                         /* desugar: length(AB) = 5 */
angle(A,B,C) = angle(D,E,F)
angle(A,B,C) = 2*angle(D,E,F)  /* 泛化数值式，§77 记号约定 */
perimeter(ABC) = distance(A, D) * 3
```

规则：

* 等式两侧各自 canonicalize 为 Number 表达式；顶层 SegmentRef 包一层 `length()`
* 顶层 PolygonRef 直接出现在 `=` 两侧 → NameError（沿 §59：`ABC = ...` 不是赋值）
* 测量函数仅 distance/length/angle/area/perimeter 可入约束表达式；构造函数（circle/line/…）出现在约束表达式 → TypeError
* `AB = <几何对象表达式>`（如 `AB = circle(O, 1)`）→ NameError（沿 §59，不是合法约束也不是赋值）

---

# 4. 两态语义（§61 落实）

同一 IR、同一谓词模块，两种执行路径：

## 4.1 断言模式（程序全定，无 `?`）

求值完成后统一检查全部约束；违反 →

```text
GeometryError:
constraint violated: AB // CD
```

错误位置取约束语句 position。操作数退化（零长段/零方向）在求值期照常报 GeometryError。

## 4.2 求解模式（含 `?` 未知点）

流水线插入求解阶段：

```text
Evaluate(固定子图) → Solve → Evaluate(全图) → Layout → SVG
```

* 固定子图只求值一次；依赖未知量的子图每次迭代重求值
* 求解收敛判据与断言谓词共用同一实现（谓词函数唯一，阈值不同：求解验收更宽，见 §6）
* 求解失败三态（ConstraintError）：
  * `under-constrained (k DOF left)` — 解点 Jacobian 秩 < 未知量个数
  * `over-constrained or inconsistent` — 收敛到非零残差局部极小
  * `no convergence after K starts` — 迭代上限内未收敛
* 冗余但一致（约束数 > 未知量数，但秩 = 未知量数且残差为零）→ 放行（如正方形 6 约束 4 未知）

---

# 5. IR Additions

```javascript
document.constraints = [
    { kind: "parallel" | "perpendicular", first: def, second: def, source, position },
    { kind: "between", a: def, b: def, c: def, source, position },
    { kind: "number_equality", lhs: numDef, rhs: numDef, source, position },
];
document.unknowns = Set<string>;   // 未知点名
```

未知点对象：

```javascript
{
    kind: "Point",
    definition: { type: "UnknownPointDefinition" },
    geometry: null,   // 求解前为 null；求解后填充 Point
}
```

数值表达式复用 v0.1.1 canonical def 树（`BinaryExpr`/`DistanceCall`/`LengthCall`/`AngleCall`/`AreaCall`/`PerimeterCall`/`NumberExpr`/`UnaryExpr`），求值走既有 `evalNumber`。

---

# 6. Numeric Policy for Constraints

谓词（求解与断言共用）：

```text
parallelResidual(g1, g2)      = |ux·vy − uy·vx|          （u、v 为归一化方向向量）
perpendicularResidual(g1, g2) = |ux·vx + uy·vy|          （同上）
betweenResidual(a, b, c)      = |AB| + |BC| − |AC|
numberEqualityResidual(l, r)  = l − r
```

容差（断言阈值，EPSILON = 1e-9）：

```text
平行/垂直:  residual ≤ EPSILON                       （归一化后为绝对量）
介于:       residual ≤ EPSILON · max(1, |AB| + |BC|)
等式:       |l − r| ≤ EPSILON · max(1, |l|, |r|)
```

求解验收阈值放宽为 `1e-7`（同谓词、相对化），避免把数值收敛噪声误判为违约；断言模式维持 EPSILON 严格阈值。

确定性（Rule 9 延伸）：迭代上限、步长、多起点种子全部确定（变量名 FNV-1a 播种）；禁 `Math.random`/`Date`；不收敛报错而非静默输出。

---

# 7. Error Model Additions

新增归类：

```text
ConstraintError   求解失败：欠定 / 超定或不一致 / 不收敛
GeometryError     断言违反（"constraint violated: ..."）——归类不变，消息前缀固定
SyntaxError       `?` 非法位置；`r = ?`；`A - B` 缺第三点；`_|_` 空白违规（文案保留）
NameError         §59 沿用：`ABC = ...`、`AB = <几何对象>`；新增：约束两侧顶层 PolygonRef
TypeError         约束操作数类型（圆/弧/多边形参与 `//`、`_|_`；构造函数入数值约束）
```

ConstraintError 为 GeometryDSLError 子类，携带 `{name, message, line, column, offset}`，CLI 打印格式与其余错误一致。

---

# 8. Label Grammar Change

```text
label point_ref ("," point_ref)* ( string )? ( "offset" point_literal )?
```

文本与 offset 可同现（v0.1.1 D1 修订）；各自仍至多出现一次，重复 → SyntaxError。默认值不变：默认文本 = 点名，默认偏移 = (8, -8)。

---

# 9. Non-Goals（v0.2）

不等式约束（`<`/`≤`/`≥`）；未知 Number；部分未知 `C = (2, ?)`；side-hint（`C = ? above AB`）；
交点方向索引（`top`/`bottom`，§26 预留）；全局最优性保证；`view` 块；Unicode 记号。
