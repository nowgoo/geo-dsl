# Geometry DSL v0.3 开发方案

依据：`docs/spec_v0.1.1.md` §77 路线图（v0.3 — Interactive SVG：drag point / recomputation / interactive labels / hover / selectable objects）；基线为已交付的 v0.1.1 + v0.2 实现。零运行时依赖、无 bundler、确定性输出（Rule 9）原则不变。

主题：**交互式 SVG**——静态输出默认字节不变，opt-in 后生成"载荷 JSON + 运行时脚本"的自包含交互图；浏览器端复用现有 engine 纯函数完成拖拽重算。

核心可行性的三条既有能力（不新造轮子）：
1. IR 的 `definition`/`dependencies` 为纯数据（§19），可直接 `JSON.stringify`，`evaluate()` 拓扑重算天然支持"改一个自由点 → 全图重算"；
2. `layout()` 产出 `document.transform = { scale, ox, oy }`，逆变换即 `x=(sx-ox)/scale, y=(oy-sy)/scale`（§41 Y 翻转唯一点的镜像操作）；
3. `labels`/`marks` 在 `evaluate()` 全量 pass 内 resolve，重算后自动跟随几何。

---

## 1. 范围与交付物

**做**（§77 五项）：

| 特性 | v0.3 语义 |
|------|-----------|
| drag point | 自由点（`PointLiteralDefinition`）可用鼠标拖动，逆变换回世界坐标后作为新字面值 |
| recomputation | 拖拽期间/结束后复用 `evaluate()` + `layout()` 全图重算，派生对象（mid/`*`/circumcircle…）实时跟随 |
| interactive labels | label 跟随对象重定位（evaluate 已覆盖）；label 本身可拖动调整 offset（仅客户端状态，不回写源码） |
| hover | 悬停高亮对象（CSS `:hover`）+ 原生 `<title>` 提示（对象名 + 关键测量，如线段长度/点坐标） |
| selectable objects | 点击选中对象（class `is-selected`），线/圆/多边形也可命中（JS 数学命中检测，非 DOM 命中） |

**不做**（顺延）：动画/过渡（v0.4+）；`view` 块；locus；触屏双指手势（单指/单鼠标为主，pointer events 天然兼容触屏单点）；逐点 `draggable: false` 开关（记录为 future）；把拖拽结果反序列化回 DSL 源码；编辑 `definition`（拖拽只改自由点的**求值结果**，Rule 6 不动）。

**交付物**：
- `docs/spec_v0.3.md`（交互契约：payload 格式、可拖对象判定、命中规则、错误回滚、`--runtime-url` 约定）
- `src/ir/serialize.js`（Document ⇄ JSON 双向，确定性 key 顺序）
- `src/render/svg/renderer.js` 扩展（`renderSVG(document, { interactive })`：标注层 + payload + 可选 bootstrap）
- `src/interactive/runtime.js`（浏览器运行时：mount/命中/逆变换/重算编排；纯核心 + DOM adapter 分离）
- CLI `--interactive [--runtime-url URL]`
- language.md / README 增补、examples +2、测试 ≥45 例
- v0.1.1 + v0.2 回归全绿，**静态输出 golden 字节不变**

---

## 2. 关键技术决策（开发前锁定）

| # | 决策点 | 结论 | 依据 |
|---|--------|------|------|
| D1 | opt-in 与回归 | 交互是 `renderSVG` 第二参数选项；不传时输出与现版本逐字节一致，golden 测试零改动 | Rule 9、§43 |
| D2 | 交付形态 | 单文件 SVG 内嵌 `<script type="application/json" class="geo-payload">`（序列化 IR）+ 一段 `<script type="module">` bootstrap：`import { mount } from "<runtimeUrl>"; mount(svg)`。运行时是独立 ES module，由 `--runtime-url` 指向（默认文档示例用 CDN/本地路径）；宿主（Markdown 站点/Vite）加载一次全站共用 | §70 Markdown 集成是主用例 |
| D3 | 单文件 file:// 直开 | **P2 实验**：`scripts/bundle-runtime.mjs` 自写 ~80 行 ESM 串联器（模块图无环、全相对导入、受我们控制），生成 `dist/runtime.inline.js` 供 `--runtime-url inline`（此时 bootstrap 改为内嵌脚本）。不引 esbuild；失败则文档声明"交互图需 HTTP 服务或宿主加载库" | §45 无 bundler、§68 零依赖 |
| D4 | 可拖对象判定 | 仅 `definition.type === "PointLiteralDefinition"` 的 Point 默认可拖；`C = ?` 未知点 → M5；派生点不可拖；payload 中显式列 `draggable: [names]`，运行时不做类型猜测 | Rule 6、spec_v0.2 §3 |
| D5 | 重算位置与方式 | 浏览器端运行时直接复用 engine：改自由点 `geometry` → `evaluate(doc)` → `layout(doc)` → 用重渲染函数重画几何层 `<g class="geo-scene">` 的 innerHTML。不修改任何 `definition` | §69 浏览器支持、§2.3 |
| D6 | 拖拽期间 viewport | pointerdown 时**冻结 transform**（避免自动 layout 逐帧缩放飞抖），pointerup 后重新 `layout()`。payload 冻结值与重算值都随重渲染写回 | 交互 UX，无需 spec 改动 |
| D7 | 逆变换 | `toWorld(t, s) = { x:(s.x-t.ox)/t.scale, y:(t.oy-s.y)/t.scale }`，与 `toScreen` 同文件放 `layout/` 导出，保证与 §41 唯一 Y 翻转点互为镜像 | §41 |
| D8 | 命中检测 | 运行时对 `pointerdown` 做数学命中（单委托监听在 svg root），按渲染顺序**逆序**取最近：Point 半径 8px（`radius` style 放大 1.5×）；Segment/Polyline/Ray/Line 用裁剪后线段的点到线段距离 < 6px；Circle 用 `|dist-r| < 6px`；Polygon 用路径距离同 Segment。命中即 class `is-hover`/`is-selected` | §39 渲染顺序决定优先级 |
| D9 | hover/select 视觉 | 纯 CSS：`<style>` 块（interactive 模式才输出）定义 `.geo-point:hover`、`.is-selected`、`.is-hover` 样式；选中态由 JS 加减 class。不用 JS 内联样式 | 确定性、零框架 |
| D10 | label 交互 | label 位置 evaluate 时已 resolve（跟随）；拖 label = 运行时维护 `name → {dx,dy}` 偏移表（SVG px），仅客户端。hover 提示用 SVG `<title>` 子元素（原生 tooltip，零 JS）：点显示坐标，线段/圆显示 length/radius | §37、§77 |
| D11 | 确定性 | payload JSON：Map 按 document 插入序展开为数组；无时间戳/随机数（Rule 9）；runtime 脚本文本静态 → 交互模式同样可 golden | §43 |
| D12 | DOM 测试 | runtime 拆两层：纯核心（逆变换/命中/重算编排/偏移表，Node 直测）+ DOM adapter（注入 `document`，测试用 ~30 行手写 stub，不引 jsdom） | §68 |
| D13 | 退化与错误 | 拖成重合点/零长/不收敛（M5 约束）→ `evaluate`/`solve` 抛错 → 运行时捕获、回滚到上一稳定几何与 transform、svg root 加 `.is-error` class + `<title>` 错误摘要，不崩溃、不静默 | §28、§48 |
| D14 | 重渲染与事件 | 几何层整体 `innerHTML` 替换；事件全部委托在 svg root 与 `<style>`/payload 之外的稳定节点上，替换不丢监听；marks/labels 层随几何层一起重画（渲染顺序 §39 不变） | §39 |

---

## 3. 架构与模块接口

流水线不变（Rule 1–11 沿用），交互是 render 之上的**旁路层**：

```
编译期（Node/CLI，不变）
  Source → … → Evaluate → Layout → Document(transform)
       → serialize.js → payload JSON
       → renderSVG(doc, { interactive: { runtimeUrl } })
       → 静态 SVG + <style> + payload + bootstrap

运行期（浏览器，src/interactive/runtime.js）
  mount(svg)
    → 读 payload → rehydrate Document
    → 委托 pointer 事件（svg root）
    → [drag 自由点] toWorld → 更新 geometry（冻结 transform）
       → evaluate → 重画 <g class="geo-scene">（渲染顺序 §39）
    → [pointerup] layout() → 重画 + 写回 transform
    → [drag label] 偏移表 → 重画 labels 层
    → 错误 → 回滚（D13）
```

新增/改动模块：

```text
src/ir/serialize.js            # documentToJSON / documentFromJSON（definitions 已是纯数据）
src/layout/viewport.js         # + toWorld()（与 toScreen 同文件，§41 唯一翻转点）
src/render/svg/renderer.js     # renderSVG(document, options?)；interactive 时加标注层/
                               # payload/bootstrap/<style>，默认路径零改动
src/interactive/runtime.js     # mount(svg, dom?) —— DOM adapter 入口
src/interactive/core.js        # 纯核心：命中检测、拖拽编排、偏移表、重算管线（Node 可测）
src/interactive/dom.js         # 事件绑定/class 操作/innerHTML 替换（可注入 stub）
src/index.js                   # + export { serializeDocument }, export { mount } 
cli/geometry.js                # + --interactive, --runtime-url
scripts/bundle-runtime.mjs     # P2：实验性单文件串联
```

payload 形状（v0.3 冻结）：

```json
{
  "version": 1,
  "canvas": { "width": 600, "height": 400, "padding": 20 },
  "transform": { "scale": 52, "ox": 40, "oy": 340 },
  "objects": [
    { "name": "A", "kind": "Point", "definition": { "type": "PointLiteralDefinition", "x": 0, "y": 0 },
      "dependencies": [], "draggable": true }
  ],
  "labels": [ { "target": "A", "text": "A", "offset": null } ],
  "marks":   [ { "kind": "right_angle", "args": ["C", "E", "B"] } ],
  "styles":  { "point": { "radius": 4, "fill": "#222" } }
}
```

`mount()` 复用 `index.js` 已导出的 `evaluate`/`layout`/`renderSVG`（浏览器 ESM 直连，无新抽象）。

---

## 4. 里程碑计划

### M0 Spec 增补 + 决策冻结（0.5d）
`docs/spec_v0.3.md`：payload 格式、可拖判定、命中阈值、回滚语义、`--runtime-url` 契约。本文档 D1–D14 固化。

### M1 序列化 + 标注层（1d）——垂直切片
- `src/ir/serialize.js` 双向转换 + 往返恒等测试（IR → JSON → IR → 编译结果一致）
- `renderSVG(document, { interactive })`：默认参数输出与现版本逐字节一致（用现有 golden 全量回归证明）；interactive 输出 `data-geo-name`/`data-geo-kind` 标注 + payload + bootstrap
- **验收**：现有 CLI 渲染 right_triangle.geo 输出不变；加 `--interactive` 后浏览器打开（runtimeUrl 指向本地包）点 A 可拖、G 实时跟随

### M2 运行时纯核心（1.5d）
- `core.js`：rehydrate、`toWorld`、命中检测（D8 全对象类型）、拖拽状态机（down/move/up）、transform 冻结/恢复、偏移表、重算编排（含 D13 回滚）
- Node 直测：命中几何、逆变换、状态机迁移、evaluate 复用（复用 engine 测试基建）

### M3 DOM adapter + hover/select/label（1d）
- `dom.js` + 事件委托、class 管理、innerHTML 替换（D14）
- `<style>` 块生成（D9）、`<title>` 提示（D10）、label 拖动
- stub DOM 单测（D12）

### M4 CLI + 文档 + golden（0.5d）
- `--interactive`、`--runtime-url`；examples +2（中点三角形交互版、circumcircle 交互版）
- golden：交互模式新目录（payload 确定性断言 + 结构断言）；language.md/README/spec 交叉引用

### M5（可选）约束图联动拖拽（1d）
`C = ?` 未知点可拖：拖拽向量作为 LM warm-start 种子（v0.2 `solveConstraints` 已支持初值），pointerup 触发重解；不可行/不收敛走 D13 回滚。验收：spec_v0.2 示例 `C = ?` + `AB ⟂ CD` 图中拖 C。

---

## 5. 测试策略

| 层 | 内容 | 手段 |
|----|------|------|
| serialize | 往返恒等、Map 序确定性、未知类型报错 | node:test |
| 标注层 | 默认输出字节不变（现有 golden 全量）；interactive 输出含 payload/style/bootstrap 且确定性（新 golden） | node:test + golden |
| core | toWorld 往返、命中（点/线/圆/多边形/优先级）、拖拽状态机、冻结/恢复、回滚 | node:test（纯函数） |
| dom | stub document 上验证委托、class 切换、innerHTML 替换后监听存活 | node:test |
| e2e | compile → serialize → rehydrate → 模拟拖拽 → evaluate/layout → 与 Node 侧直接重算结果一致 | node:test |
| 手工 | Chrome/Firefox/Safari 打开 3 个示例：拖点/拖 label/hover/选中/退化回滚 | checklist 入 spec |

不引入 jsdom/浏览器自动化（零依赖）；M5 若实做，solver 复用现有 solver 测试模式。

---

## 6. 错误处理要点

- 拖拽中 `evaluate` 抛 `GeometryError`（重合点、零长段、不相交）→ 捕获 → 回滚 `objects/transform/labels` 到上一稳定快照（pointerdown 时深拷贝 payload 级数据即可，量小）→ root `.is-error` + `<title>`；错误文案直接复用 engine 错误 message（含对象名，§48 风格降级为无行列号）
- payload 缺字段/版本不符 → `mount()` 抛 `Error("geometry payload version mismatch")`，控制台可见
- `--interactive` 而未给 `--runtime-url` 且非默认可用路径 → CLI 警告但仍输出（bootstrap 引用默认 URL）
- 运行时不修改 `definition`、不新增对象（若未来支持，需先过 Rule 6 评审）

---

## 7. 风险与难点

| 风险 | 缓解 |
|------|------|
| 浏览器 bare-specifier import 不可用（`import "geometry-dsl"`） | bootstrap 只用 `--runtime-url` 具体文件 URL；文档给出"静态站 serve 包目录 / import map / 打包器"三种接入说明 |
| file:// 直开被 CORS 拦（ESM 相对导入禁用） | P2 实验串联器（D3）；短期文档声明需 HTTP 宿主 |
| innerHTML 替换丢监听 | 全部委托 root（D14），M3 有专项测试 |
| 拖拽逐帧 layout 抖动 | 冻结 transform（D6） |
| payload 与 source 漂移 | payload 由编译产物生成，不存在手维护；往返恒等测试兜底 |
| M5 求解器每次拖动重解的性能 | 仅 pointerup 解一次，拖动中仅线性跟随；LM warm-start 常数次迭代 |

---

## 8. 排期

| 里程碑 | 工作量 | 累计 |
|--------|--------|------|
| M0 spec + 决策 | 0.5d | 0.5d |
| M1 序列化 + 标注层（垂直切片） | 1d | 1.5d |
| M2 运行时纯核心 | 1.5d | 3d |
| M3 DOM + 交互特性 | 1d | 4d |
| M4 CLI + 文档 + golden | 0.5d | 4.5d |
| M5 约束联动（可选） | 1d | 5.5d |

---

## 9. 完成定义（DoD）

1. `npm test` 全绿：v0.1.1 + v0.2 回归零改动，新增 ≥45 例
2. 现有全部 golden 输出逐字节不变；新增交互 golden 通过
3. `geometry render examples/midpoint.geo --interactive` 产出单文件交互 SVG：拖 A/B/C，D/E/G 实时跟随，label 跟随并可拖，hover 高亮 + `<title>`，点击可选中
4. 退化拖拽（两点重合）回滚不崩溃
5. `serializeDocument` 往返恒等；payload 确定性（两次生成逐字节一致）
6. language.md / README / spec_v0.3 交付；examples 含 ≥2 交互示例
7. Rule 1–11 无违背（engine 不知 SVG；renderer 不算几何——重算发生在 interactive 层，其复用 engine 纯函数）

---

## 10. 待澄清清单（按 D 系列默认执行，如与预期不符在此追加）

- D2：runtimeUrl 默认值策略——npm 包相对路径 vs CDN（暂定：CLI 默认相对 `./geometry-dsl-runtime.js`，由用户部署；文档给 CDN 示例）
- D4：逐点禁拖开关是否提前（暂不做，需求出现再加 style 扩展）
- D3：实验串联器的维护成本若超预期，是否降级为"仅宿主加载"并写入 spec（P2 失败的既定出口）
- M5：拖拽中是否给约束解的实时预览（暂定否，仅 pointerup 重解）
