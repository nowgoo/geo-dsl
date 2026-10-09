# Geometry DSL v0.2 求解器技术调研（M3）

结论先行：**Levenberg–Marquardt（LM）+ 中心差分数值 Jacobian + 列主元 Gram–Schmidt 秩判**，
零依赖手写实现，参数冻结如下（与 dev_plan D8–D11 一致）。

---

## 1. 问题形式化

约束系统 = 残差向量 r(x) = 0，x ∈ R^(2k)（k 个未知点坐标）。
残差由 `engine/constraints.js` 的谓词给出（与断言模式同一实现，Rule 13）：

```text
平行/垂直:      |sin| 或 |cos|（归一化方向向量）→ 无量纲，绝对量
介于:           (|AB|+|BC|−|AC|) / max(1, |AB|+|BC|)
等式:           (lhs − rhs) / max(1, |lhs|, |rhs|)
```

全部残差已相对化 → 目标函数 F(x) = Σ rᵢ(x)²，验收 max|rᵢ| ≤ SOLVE_TOLERANCE = 1e-7。

## 2. 方法对比

| 方案 | 结论 | 理由 |
|------|------|------|
| Gauss-Newton | 弃 | 远离解处病态；阻尼版即 LM |
| **Levenberg–Marquardt** | **选** | 小规模稠密问题事实标准；λ 自适应兼具最快下降与 GN |
| 解析 Jacobian | 弃（v0.2） | 28 个 primitives 链式求导实现/维护成本高；数值微分对 k≤20 的小系统开销可忽略 |
| 中心差分 | **选（修订）** | 原计划前向差分（D8，h=√EPS≈3.16e-5），实测 Jacobian 截断误差 ~1e-5 使残差停在 1e-6 量级、正卡在验收阈值上方；改中心差分 h=6e-6（machine-eps^(1/3)），误差 ~1e-10，代价每列多一次求值（小系统可忽略） |
| 全局方法（区间/SDP） | 弃 | 零依赖约束下工程复杂度不可控；多起点缓解局部极小 |

## 3. LM 参数（冻结）

```text
maxIterations   = 200        （每起点；M4 计划值）
lambdaInitial   = 1e-3
lambda 调整      = 成功 /3，失败 ×2，上限 1e12（超过则本起点终止）
diffStep        = 6e-6（中心差分，machine-eps^(1/3)，再乘 max(1, |xⱼ|)；修订记录见 §2）
收敛判据         梯度 max|(Jᵀr)ᵢ| < 1e-12，或步长改进 sqrt(ΔF) < 1e-12·(sqrt(F)+1)
线性子问题       (JᵀJ + λ·diag(JᵀJ)) δ = −Jᵀr（Marquardt 缩放），
                高斯消元 + 部分主元；奇异 → λ ×2 重试
残差求值抛异常    （退化几何，如中间态零长段）→ 该步视为失败，λ ×2；
                不中断求解——这是多起点必须存在的第二个原因
抛光（polish）    收敛后从当前点重启 LM 至多 3 次，跨过单次运行的噪声地板
                （窄谷系统单次常停在 ~1e-6，重启可继续下降）
```

## 4. 多起点与确定性（D9/D11）

* 起点数 K = 8：起点 0 全零；起点 1..7 由 mulberry32(PRNG) 生成，幅度 = 固定点 bbox 外接尺度（min 1）
* 种子 = FNV-1a(未知点名按文档序 join "|")；禁 `Math.random`/`Date`（Rule 9）
* 依次尝试，**首个满足 SOLVE_TOLERANCE 的解即被接受**（不比选择最优——保证运行次数确定）
* 解不唯一（镜像歧义）时取首个收敛解；v0.2 文档声明不保证全局最优，side-hint 留 v0.3

## 5. DOF / 欠定 / 超定诊断（D10，M5）

* 解点处再算一次数值 Jacobian J（m×n）
* 秩：**列主元 Gram–Schmidt**（Businger–Golatin 思想的小系统实现），
  容差 tol = max(m,n) · EPSILON · max列范数
* 分类（判定顺序固定）：
  1. max|rᵢ| > SOLVE_TOLERANCE 且 LM 收敛（内部判据满足但残差不归零）→ `over-constrained or inconsistent`
  2. max|rᵢ| > SOLVE_TOLERANCE 且所有起点都未达 LM 内部收敛 → `no convergence after K starts`
  3. max|rᵢ| ≤ SOLVE_TOLERANCE 且 rank(J) < n → `under-constrained (k DOF left)`
  4. 通过，且 rank(J) < m（m > rank）→ 冗余但一致，放行
* 已知局限（写入报错措辞与文档）：秩在解点局部有效，非全局自由度证明

## 6. 性能预算

残差一次求值 = 依赖未知量的子图重求值（`evaluate(document, { only })`）。
固定子图只求值一次。预算：k=6、约束 8、迭代 200、起点 8 → 子图求值 ≤ 8×200×7 ≈ 1.1e4 次，
每次微秒级 → 毫秒级总耗时，无需缓存/稀疏化优化（记录为未来项）。
