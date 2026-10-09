# Geometry DSL v0.2 开发方案

依据：`docs/spec_v0.1.1.md`（§77 路线图、§12 保留 token、§60-61 约束边界）；基线为已交付的 v0.1.1 实现（213 测试全绿）。
主题：**约束（Constraints）**——五种约束语句 + 断言检查 + 数值求解器。零运行时依赖原则不变。

---

## 1. 范围与交付物

**做**（§77）：约束语法五形式；全定程序断言检查；`C = ?` 未知点 + 数值求解；DOF（欠定/超定）诊断；求解器技术调研文档。

```geometry
AB // CD                              /* 平行 */
AB _|_ CD                             /* 垂直（两侧必须留空白，§12） */
A-B-C                                 /* B 介于 A、C 之间且共线 */
AB = CD                               /* 等长 */
angle(A,B,C) = 2*angle(D,E,F)         /* 角度约束，复用测量函数，支持泛化数值式 */
```

**不做**：Unicode 记号（`∥`/`⟂`/`∠` 仅文档别名，§77）；不等式约束（`<`/`≤`）；未知 Number、部分未知 `C = (2, ?)`；locus/动画/交互；全局最优性保证；`view` 块（继续顺延）。
**顺带交付**：label text + offset 同现（v0.1.1 方案 D1 遗留候选，0.25d 小项）。

**交付物**：
- `docs/spec_v0.2.md`（约束语法/两态语义/求解器契约/错误表增补）
- `docs/solver_notes.md`（调研结论：GN vs LM、数值 vs 解析 Jacobian、DOF 方法）
- 求解器模块 + 约束谓词模块 + 编译管线接入
- language.md 增补（含 `//` 不再是注释的迁移说明）、examples ≥6、测试 ≥145 例
- v0.1.1 回归全绿（仅 2 条 `//`/`_|_` 保留报错测试翻转为正例）

---

## 2. 关键技术决策（开发前锁定）

| # | 决策点 | 结论 | 依据 |
|---|--------|------|------|
| D1 | Unicode 记号 | 不入 lexer；源码出现 `∥`/`⟂`/`∠` → SyntaxError "unexpected character" | §77 记号约定 |
| D2 | 约束两态语义 | 同一套 IR/谓词，两条执行路径：程序全定（无 `?`）→ 求值后断言检查，违反报 GeometryError；含 `?` 未知点 → 数值求解，失败报 ConstraintError | §61 两分法 |
| D3 | 未知量范围 | 仅 Point（单大写名）：`C = ?`；`r = ?`、`C = (2, ?)` → SyntaxError，报错注明 v0.2 限制 | §61 示例 |
| D4 | `AB = <数值式>` | 支持，desugar 为 `length(AB) = <式>`（与泛化角度式同机制）；LHS/RHS 为 PolygonRef → NameError（沿 §59） | §77 泛化式延伸 |
| D5 | 结构约束操作数 | `//`、`_|_` 接受 Line/Segment/Ray（隐式 ref 或 `line()`/`ray()` 调用）；Segment 共线亦判平行（按方向向量）；其余类型 → TypeError | §77、§16 |
| D6 | 谓词容差 | 垂直/平行先归一化方向向量再比 EPSILON（消除长度²尺度）；等长用相对容差 `|a−b| ≤ EPSILON·max(1,a,b)`；betweenness 残差 `\|AB\|+\|BC\|−\|AC\|`（光滑、兼具共线与介于） | §27 推广 |
| D7 | `AB = CD` 与 §59 兼容 | parser 仍产出 AssignmentStmt；semantic 检测 RHS 为隐式引用/测量表达式时重分类为约束，否则维持原 NameError | §59、§48 |
| D8 | 求解器 | Levenberg–Marquardt + 前向差分数值 Jacobian，零依赖手写；残差 = 对依赖未知量的子图重新求值；固定子图只求值一次 | §68 |
| D9 | 求解确定性 | 迭代上限/步长/多起点种子全确定性（FNV-1a(变量名) 播种 mulberry32）；禁 `Math.random`/`Date`（Rule 9）；不收敛 → ConstraintError，不静默输出 | Rule 9 |
| D10 | 欠定/超定 | 在解点算数值 Jacobian，列主元 QR 求秩：rank < n → ConstraintError "under-constrained (k DOF left)"；残差不可归零 → "over-constrained or inconsistent"；冗余但一致（rank < m 且残差≈0）→ 放行 | §61 |
| D11 | 初始位置 | 未知点默认 (0,0) + 确定性扰动多起点（K=8）；解不唯一（镜像歧义）v0.2 不解决，取首个收敛解并文档声明 | — |
| D12 | 错误归类 | 新增 `ConstraintError`（GeometryDSLError 子类）；全定断言违反仍报 GeometryError "constraint violated"；约束不可满足/欠定/不收敛 → ConstraintError；位置取约束语句 position | §48 |
| D13 | 渲染 | 约束零视觉输出（视觉靠 mark 语句）；render/layout 管线零改动 | §38 |
| D14 | 回归注意 | `//`、`_|_` 由保留报错转为正常 token；v0.1.1 的 2 条 lexer 负例测试翻转为正例；语言文档加迁移说明 | §12 |

---

## 3. 架构与模块接口

流水线在 v0.1.1 基础上插入约束阶段（Rule 1-11 全部沿用）：

```
Source → Lexer → Parser → AST → Semantic → IR → DepGraph
  → Evaluate(固定子图，一次) → [有未知点? Solve : 断言检查] → Evaluate(全图) → Layout → SVG
```

新增/改动模块：

| 模块 | 职责 | 禁止 |
|------|------|------|
| `src/solver/`（新） | `variables.js` 变量提取与未知闭包子图切分；`lm.js` LM 主循环；`rank.js` 列主元 QR 秩；`solve.js` 驱动（初始化/多起点/收敛分类） | 读 AST（新 Rule 12）；知道 SVG |
| `src/engine/constraints.js`（新） | 唯一谓词/残差实现：isParallel/isPerpendicular/isBetween/numberEquality 残差（D6） | 被 solver 与断言检查共用（新 Rule 13：单一事实来源） |
| `src/ir/document.js` | 增 `document.constraints = []`、`document.unknowns = []`；未知点 definition `{type:"UnknownDefinition"}`（solve 前坐标 null） | — |
| `src/parser/` | 新 token `//`、`_|_`（保留空白规则）、`?`；约束语句分发（有界 lookahead）；AST 增 `ConstraintStmt{op,lhs,rhs}`、`BetweennessStmt`、`UnknownAssignmentStmt` | 几何计算 |
| `src/semantic/analyzer.js` | D7 重分类；操作数矩阵检查（D5）；desugar：`AB=CD`→NumberConstraint(length)、`angle(...)=...` 原样为 NumberConstraint | 输出 SVG |
| `src/errors.js` | 增 ConstraintError | — |
| `cli/geometry.js` | 无新参数；ConstraintError 沿用 §48 错误打印 | — |

IR 约束节点：

```javascript
// kind: "parallel" | "perpendicular" | "between" | "number_equality"
// operands: 结构约束为对象名对；number_equality 为已 desugar 的左右 Number 表达式
class Constraint { constructor({ kind, operands, position }) { ... } }
```

新增架构规则：**Rule 12** solver 只经 IR/求值器读几何；**Rule 13** 断言检查与求解共用 `constraints.js` 谓词。

Parser 分发要点（statement 起始消歧）：

```text
单大写 A 开头  → `A = ?`（UnknownAssignment）| 赋值 | 裸引用 | 点ref后遇 "-" → A-B-C
双大写 AB 开头 → 句尾 → 裸引用；遇 "=" → 约束路径（RHS 隐式ref/数值式）
小写 fn( 开头  → 解析表达式后遇 "=" 且 LHS 含测量调用 → 约束；否则 SyntaxError
任意约束 LHS 后遇 "//" 或 "_|_" → 结构约束
```

---

## 4. 里程碑计划

总估算 ~11.5 人日（见 §8）。里程碑间串行依赖。

### M0 Spec 增补 + 决策冻结（0.5d）
- 写 `docs/spec_v0.2.md`：约束 grammar 增补、两态语义（D2）、求解器契约（输入/输出/收敛判据/错误）、§48 错误表增补 ConstraintError
- 冻结 D1-D14
- **验收**：spec 评审通过，语法示例全部可手写出期望 IR

### M1 Lexer + Parser（1.5d）
- `//`、`_|_` 转正（`_|_` 两侧空白规则保留，`AB_|_CD` 报既有 SyntaxError）；新增 `?` token
- 约束语句解析（含 D7 兼容路径与分发表）；`A-B-C`（缺第三点 → SyntaxError）；`C = ?`
- AST：ConstraintStmt / BetweennessStmt / UnknownAssignmentStmt
- **验收**：5 种形式 + 泛化角度式 AST 断言；`//`、`_|_` 正反例 ≥15

### M2 Semantic + IR + 断言模式（2.5d）——垂直切片
- D7 重分类、D5 操作数矩阵、D3 未知量校验；desugar 见 D4
- IR constraints/unknowns；`C = ?` 时标记未知闭包子图
- 全定程序：求值后统一 `checkConstraints()`（D6 谓词），违反 → GeometryError + 位置 + 源码行
- **验收**：断言模式端到端（合法通过/违反报错/§59 兼容/`ABC = ...` 拒绝）≥35 例；无 solver 即可用

### M3 求解器调研（1d）
- 对比：Gauss-Newton vs LM；解析 vs 数值 Jacobian（按 28 primitives 推导成本）；DOF 方法（计数 vs 解点秩）
- 产出 `docs/solver_notes.md`，冻结 D8-D11 细节
- **验收**：选型理由与收敛判据成文

### M4 求解器实现（3d）
- `solver/` 四模块；变量提取 = 未知点坐标向量；残差 = 子图重求值后取 `constraints.js` 残差
- LM 主循环（λ 初值 1e-3、成功 ×/3、失败 ×2、上限 200 迭代）；收敛 `‖r‖₂ ≤ tol·scale`；确定性多起点 K=8（D9/D11）
- 编译管线接入（§3 流水线）；ConstraintError 三态（不一致/欠定/不收敛）
- **验收**：等腰/直角/正方形构造等 ≥25 个求解用例在 1e-6 内收敛；双跑输出逐字节一致

### M5 DOF 诊断（1.5d）
- `rank.js`：列主元 QR，秩容差 `max(m,n)·EPSILON·‖J‖`
- 三态分类报错，信息列出未满足约束名与位置；冗余一致放行（D10）
- **验收**：欠定（少一条约束）/超定矛盾/冗余一致 各 ≥2 例

### M6 加固 + 文档 + 终验收（1.5d）
- examples ≥6：`_|_` 验证垂足、`//` 平行四边形、`A-B-C` 共线、等腰 angle 式、`AB = 5` 定长、`C = ?` 完整求解例
- language.md 增补 + `//` 迁移说明；label text+offset（D14/遗留）；golden 双跑
- **终验收**：见 DoD

---

## 5. 测试策略

| 层 | 方式 | 数量目标 |
|----|------|---------|
| lexer | `//`、`_|_` 空白规则正反例、`?`、非法位置 | ≥15 |
| parser | 5 形式 + 泛化式 AST；`AB=CD` vs 裸引用 vs §59 歧义 | ≥25 |
| semantic | 操作数矩阵、D3/D4/D7 路径、desugar canonical 等价深比较 | ≥30 |
| engine 断言 | 谓词 EPSILON 邻域（临界垂直/共线/介于）、违反断言错误信息 | ≥25 |
| solver | 收敛精度、确定性双跑、多起点、欠定/超定/不收敛/镜像解 | ≥40 |
| e2e/golden | examples 冒烟 + golden 双跑 + 回归 v0.1.1 全量 | ~10 |

错误测试覆盖增补归类表（ConstraintError 各态 + violated GeometryError 每类 ≥1 例）。

---

## 6. 错误处理要点

- 新增 `ConstraintError`：`under-constrained (k DOF left)` / `over-constrained or inconsistent` / `no convergence after N starts`
- 全定断言违反 → GeometryError `constraint violated: AB // CD`（附位置与源码行 caret）
- 迁移友好：句中孤立 `//` → SyntaxError 提示注释是 `/* */`；`AB_|_CD`（无空白）保留 v0.1.1 既有报错文案

---

## 7. 风险与难点

| 风险 | 应对 |
|------|------|
| 残差需整图重求值，迭代开销 | 固定前缀只求值一次；仅重算未知闭包子图；图规模小，够用 |
| 初始全在 (0,0) → 零 Jacobian | 确定性扰动 + K=8 多起点（D11） |
| 局部极小/收敛到错误解 | 多起点取残差最小者；文档声明不保证全局最优（§77 本就定位"开始研究"） |
| 镜像歧义（上/下对称解） | v0.2 取首个收敛解；side-hint 语法（`C = ? above AB`）留 v0.3 |
| 秩判仅在解点局部有效 | 报错措辞 "near solution"；文档写明启发式边界 |
| 角度 0°/180° 附近残差病态 | `angle()` 已限 0..180 无 wrap；邻域专项用例 |
| `//` 从注释误解转正 | language.md 迁移章节 + 孤立 `//` 报错提示 |
| LM 数值参数调优 | 调研阶段（M3）定死参数并在 solver_notes.md 记录依据；不做成配置 |

---

## 8. 排期

| 里程碑 | 人日 | 累计 |
|--------|------|------|
| M0 Spec+冻结 | 0.5 | 0.5 |
| M1 Lexer+Parser | 1.5 | 2 |
| M2 语义+断言模式 | 2.5 | 4.5 |
| M3 求解器调研 | 1 | 5.5 |
| M4 求解器实现 | 3 | 8.5 |
| M5 DOF 诊断 | 1.5 | 10 |
| M6 加固+文档+验收 | 1.5 | 11.5 |

含 20% buffer ≈ 14 人日，单人约 3 周。可并行点：M1 完成后 M2 与 M3 调研可双人流水分工。

---

## 9. 完成定义（DoD）

1. §77 五种约束形式在全定程序上全部可用；违反时报 GeometryError（位置 + caret）
2. `C = ?` 求解验收例端到端出 SVG（如：A、B 固定，`A-C-B` + `AC = 3` + `AB = 4` 定出 C），双跑逐字节一致；正方形构造例（6 约束 4 未知，冗余一致）通过
3. ConstraintError 三态各 ≥1 例，信息可定位到约束语句
4. v0.1.1 全量回归绿（除 D14 翻转的 2 条）；新增测试 ≥145；每类错误归类 ≥1 例
5. 零运行时依赖不变；core 无 `node:` 导入；solver 无 `Math.random`/`Date`
6. spec_v0.2.md、solver_notes.md、language.md 增补、≥6 examples 交付

---

## 10. 待澄清清单（按 D 系列默认执行，如与预期不符在此追加）

- D11 镜像歧义：首个收敛解是否可接受（备选：报错要求 side-hint）
- D10 欠定程序是否允许"求解可见部分 + 警告"而非报错（当前：报错）
- `?` 数字未知量、`C = (2, ?)` 部分未知：留 v0.3
- side-hint 语法与 top/bottom 交点索引（§26 预留）：留 v0.3
- 求解失败时是否输出"最接近解"的调试 SVG（当前：不输出，只报错）
