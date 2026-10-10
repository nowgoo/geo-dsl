# Geometry DSL v0.3 — Interactive SVG

依据：`spec_v0.1.1.md` §77 路线图；实现方案见 `docs/dev_plan_v0.3.md`（D1–D14 决策）。
状态：Draft v0.3（随实现同步修订）。

---

## 1. 定位与不变量

交互是 render 之上的**旁路层**，不改变既有架构约束（§76 Rule 1–11）：

- 静态输出（`renderSVG(document)` 单参调用）与 v0.2 **逐字节一致**；交互完全 opt-in。
- Engine 不知道 SVG（Rule 3）；浏览器端重算复用 engine 纯函数 `evaluate()` / `layout()`，发生在 interactive 层，不在 render 层。
- Renderer 不执行几何计算（Rule 4）；`<title>` 提示文本是对已求值 IR 数据的**展示格式化**（`render/svg/titles.js`），不构造、不求解。
- IR 仍保存 construction definition（Rule 6）；拖拽自由点修改的是其 `PointLiteralDefinition` 的字面参数（自由点的 definition 本身就是位置），派生对象 definition 永不被修改。

## 2. 交互管线

```
编译期（不变）: … → Evaluate → Layout → Document(transform)
    → serialize（IR → payload JSON）
    → renderSVG(doc, { interactive: { runtimeUrl } })
    → SVG = 静态标注层 + <style> + payload + bootstrap

运行期（src/interactive/runtime.js）
    mountAll(document)
      → 每个含 .geo-payload 的 svg.geo-interactive：
        rehydrate（payload → Document）→ 事件委托
        [drag 点]   更新字面定义 → evaluate（transform 冻结）→ 重画 geo-scene
        [pointerup] layout()（解冻重排）→ 重画
        [drag label] 客户端偏移表 → 平移 data-geo-label 节点
        [错误]      回滚到拖拽前快照 + .is-error
```

## 3. 渲染输出（interactive 模式）

```xml
<svg xmlns="…" class="geo-interactive" width="…" height="…" viewBox="…">
  <g class="geo-scene">
    <!-- §39 渲染顺序不变；每个对象的元素包一层标注组 -->
    <g class="geo-obj" data-geo-name="A" data-geo-kind="Point"><circle …/></g>
    <g class="geo-obj" data-geo-name="AB" data-geo-kind="Segment"><line …/></g>
    <!-- Polygon 的 fill 与 outline 各自包裹，data 属性相同 -->
    <g data-geo-label="A"><text …>A</text></g>
    <path …/>  <!-- marks：不加标注，v0.3 不可交互 -->
  </g>
  <style>…hover/selected/cursor…</style>
  <script type="application/json" class="geo-payload">{…}</script>
  <script type="module" class="geo-bootstrap">import { mountAll } from "RUNTIME_URL";
mountAll(document);</script>
</svg>
```

- `RUNTIME_URL`：`--runtime-url` 指定，缺省 `./geometry-dsl-runtime.js`（由部署方提供；指向本包 `src/interactive/runtime.js` 的可访问 URL，或 CDN，或 `scripts/bundle-runtime.mjs` 产出的单文件）。脚本上下文做 `<` → `\u003c` 转义。
- **内联模式**：`--inline`（或 `renderSVG` 的 `interactive.runtimeSource`）把
  bundle-runtime 产出的纯脚本文本直接嵌入（全局名 `GeometryDSLInteractive`），
  bootstrap 换为 `window.GeometryDSLInteractive.mountAll(document);`；嵌入时对
  源内 `</script` 做反斜杠转义，payload/runtime/bootstrap 顺序固定。双击
  file:// 直开可用。
- payload JSON 内 `<` 转义为 `\u003c`，其余为标准 JSON。
- runtime 加载失败时图形保持静态（优雅降级），不报错阻断页面。

## 4. Payload 格式（version 1，冻结）

```json
{
  "version": 1,
  "mode": "free | assert | solve",
  "canvas": { "width": 600, "height": 400, "padding": 20 },
  "transform": { "scale": 52, "ox": 40, "oy": 340 },
  "objects": [
    { "name": "A", "kind": "Point",
      "definition": { "type": "PointLiteralDefinition", "x": {"type":"NumberExpr","value":0}, "y": {"type":"NumberExpr","value":0} },
      "dependencies": [],
      "draggable": true,
      "unknown": false,
      "solved": null }
  ],
  "labels": [ { "target": "A", "text": "A", "offset": { "x": 8, "y": -8 } } ],
  "marks":  [ { "kind": "right_angle", "args": [ …definition 节点… ] } ],
  "styles": { "选择器": [ [ [key, value], … ], … ] }
}
```

- `definition`：canonical definition 原样 JSON（definition 与数值节点均为纯数据；序列化时递归剥离 `position` 字段）。
- `draggable`：`definition.type === "PointLiteralDefinition"`（free）或 `UnknownPointDefinition`（solve，M5）；其余 false。
- `solved`：`UnknownPointDefinition` 点的求解坐标 `[x, y]`（solver 输出）；rehydrate 时先写入 `object.geometry` 再 `evaluate()`（evalDefinition 对 unknown 点读取已有 geometry）。
- `mode`：`free`（无约束）/ `assert`（全定 + 断言约束）/ `solve`（含未知点）。
- 确定性：objects/labels/marks 按文档序展开，两次编译同一 source 生成逐字节相同 payload。

## 5. 交互语义

### 5.1 可拖对象

| 对象 | 判定 | 行为 |
|------|------|------|
| 自由点 | `PointLiteralDefinition` | 拖拽更新字面坐标；move 期间 evaluate（transform 冻结）；up 后 layout 重排 |
| 未知点（M5） | `UnknownPointDefinition` 且 mode=solve | 拖拽直接写 `geometry`（作为 warm-start 种子）；up 后重解约束 |
| 派生点/线/圆/多边形 | 其余 | 不可拖，仅可选中 |
| label | 所有已 resolve 的 label | 拖拽更新客户端偏移表（SVG px），不回写源码、不进 payload |

### 5.2 命中检测（运行时数学命中，单委托监听在 svg root）

按 §39 渲染顺序**逆序**优先：label（圆点距离 ≤ 12px，含已应用偏移）→ point（≤ max(8, radius×1.5+4) px）→ stroke（segment/line/ray/polyline 用点到线段距离 ≤ 6px，circle 用 `|dist−r| ≤ 6px`，arc 按 16 点采样 ≤ 6px，polygon 取各边最小值）→ polygon fill（point-in-polygon，仅当选中不拖拽）。

### 5.3 视觉反馈（纯 CSS，`<style>` 块确定性生成）

- hover：`.geo-obj:hover { filter: drop-shadow(0 0 3px var(--geo-accent)) }`
- 选中：`.is-selected`（点击命中对象；点击空白清除）
- 拖拽中：root `.is-dragging`（point cursor 变 grabbing）
- 错误回滚：root `.is-error` + scene `<title>` 错误摘要（短暂显示，下一次成功操作清除）
- `<title>` 子元素（原生 tooltip）：点显示坐标，segment/circle/arc/polygon 显示 length/周长/radius——由 `render/svg/titles.js` 从已求值 geometry 格式化。

### 5.4 Transform 冻结

pointerdown 命中可拖对象时冻结当前 transform：move 期间不调用 `layout()`（避免逐帧重排抖动），重画使用冻结 transform；pointerup 调用 `layout()` 解冻重排并重画。label 拖动不涉及 transform。

### 5.5 错误与回滚

- 拖拽导致 `evaluate()` 抛错（重合点、零长、不相交等 §28 退化）→ 捕获，恢复 pointerdown 时的快照（各对象 geometry + 自由点字面值 + transform），重新 evaluate + 重画，root 加 `.is-error`。
- mode=assert：pointerup 后重跑 `checkConstraints()`，违反 → 同上回滚（约束是不变量）。
- mode=solve：pointerup 后 `solveConstraints(doc, { warmStart })`（start 0 用拖拽位置替换默认零种子，其余起点仍确定性随机），失败 → 回滚。
- 运行时不修改 definition（自由点字面值除外）、不新增对象；payload 版本不符 → `mount` 抛错至 console。

## 6. API

```js
// 新增导出（src/index.js）
renderSVG(document, { interactive: { runtimeUrl } })  // 第二参可选，缺省静态输出
serializeDocument(document)                            // Document → payload JSON（字符串）
mount, mountAll                                        // 来自 src/interactive/runtime.js
toWorld(transform, screenPoint)                        // src/layout/viewport.js，toScreen 逆变换

// runtime（浏览器）
mountAll(document)     // 挂载页面内所有 svg.geo-interactive（WeakSet 去重）
mount(svg)             // 挂载单个
```

## 7. CLI

```bash
geometry render input.geo --interactive [--runtime-url URL]
```

`--interactive` 需与 `-o` 同用或输出 stdout 均可；runtimeUrl 缺省 `./geometry-dsl-runtime.js`。

## 8. 确定性

- interactive 输出同样 golden 可测：payload 逐字节确定（§4）、`<style>`/bootstrap 文本静态、标注层由文档序生成。
- 无时间戳、随机数、Map 迭代序依赖（Rule 9）。

## 9. 限制（v0.3 明确不做）

- file:// 双击直开单文件：ESM 相对导入受 CORS 限制。使用 `npm run bundle-runtime`
  生成 `dist/geometry-dsl-runtime.js` 后以 `--inline` 嵌入（实验性，见 dev_plan D3）。
- 拖拽结果不回写 DSL 源码；label 偏移不持久化。
- 无动画/惯性；无多选；无框选；marks 不可交互。
- 断言模式文档拖拽中实时显示违反状态，release 时回滚（不提供"违反拖拽"持久化）。
