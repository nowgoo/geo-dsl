/**
 * Interactive runtime (mount) tests with a minimal DOM stub (plan D12):
 * verifies event wiring, re-render via renderSceneChildren, client-side
 * state re-application (label offsets, selection) and error surfacing —
 * without jsdom (§68 zero-dependency).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, renderSVG, serializeDocument, toScreen } from "../../src/index.js";
import { mount } from "../../src/interactive/runtime.js";
import { el, stubDom, dragEvent } from "./stub-dom.js";

/** an interactive svg stub carrying a real payload from the compiler */
function stubSvg(source) {
    const compiled = compile(source);
    const markup = renderSVG(compiled, { interactive: true });
    const payloadText = serializeDocument(compiled);
    const scene = el("g", { class: "geo-scene" });
    const payloadScript = el("script", { type: "application/json", class: "geo-payload" });
    payloadScript.textContentValue = payloadText;
    const svg = el("svg", { class: "geo-interactive" }, [scene, payloadScript]);
    return { svg, scene, compiled, markup, payloadText };
}

const SRC = [
    "A = (0, 0)",
    "B = (6, 0)",
    "C = (2, 4)",
    "ABC",
    "D = mid(BC)",
    "AD",
].join("\n");

function screenOf(doc, name) {
    return toScreen(doc.transform, doc.objects.get(name).geometry);
}

// --- tests ---------------------------------------------------------------------------

test("mount parses payload, wires events, returns controller", () => {
    const { svg } = stubSvg(SRC);
    const controller = mount(svg, stubDom);
    assert.ok(controller, "controller returned");
    assert.ok(controller.doc.objects.get("A").geometry, "document evaluated");
    assert.ok(svg.listeners.pointerdown, "pointerdown wired");
    assert.ok(svg.listeners.pointermove, "pointermove wired");
    assert.ok(svg.listeners.pointerup, "pointerup wired");
});

test("mount is idempotent (second mount returns null)", () => {
    const { svg } = stubSvg(SRC);
    assert.ok(mount(svg, stubDom));
    assert.equal(mount(svg, stubDom), null);
});

test("mount rejects non-interactive svg", () => {
    const bare = el("svg");
    assert.throws(() => mount(bare, stubDom), /geo-payload/);
});

test("full drag flow: down/move/up re-renders and updates geometry", () => {
    const { svg, scene, compiled } = stubSvg(SRC);
    const controller = mount(svg, stubDom);
    const doc = controller.doc;

    const gBefore = { ...compiled.objects.get("D").geometry };
    const bScreen = screenOf(doc, "B");

    svg.dispatch("pointerdown", dragEvent(bScreen.x, bScreen.y));
    assert.ok(svg.classSet.has("is-dragging"));
    assert.equal(svg.captured, 1);

    const target = { x: bScreen.x + 20, y: bScreen.y + 10 };
    svg.dispatch("pointermove", dragEvent(target.x, target.y));
    assert.ok(typeof scene.innerHTMLValue === "string", "scene re-rendered");
    assert.ok(scene.innerHTMLValue.includes(`data-geo-name="D"`), "annotation layer present");

    svg.dispatch("pointerup", dragEvent(target.x, target.y));
    assert.ok(!svg.classSet.has("is-dragging"));

    // derived midpoint followed B
    const d = doc.objects.get("D").geometry;
    assert.notDeepEqual({ ...d }, gBefore);
    // literal rewritten
    assert.equal(doc.objects.get("B").definition.x.type, "NumberExpr");
});

test("pointermove without drag does nothing", () => {
    const { svg, scene } = stubSvg(SRC);
    mount(svg, stubDom);
    svg.dispatch("pointermove", dragEvent(100, 100));
    assert.equal(scene.innerHTMLValue, null);
});

test("degenerate drag surfaces the error on the svg root and rolls back", () => {
    const { svg, scene } = stubSvg("A = (0,0)\nB = (6,0)\nAB\nD = mid(AB)");
    const controller = mount(svg, stubDom);
    const doc = controller.doc;
    const geomBefore = JSON.stringify(doc.objects.get("D").geometry);

    const b = screenOf(doc, "B");
    const a = screenOf(doc, "A");
    svg.dispatch("pointerdown", dragEvent(b.x, b.y));
    svg.dispatch("pointermove", dragEvent(a.x, a.y)); // B onto A: zero-length AB

    assert.equal(svg.classSet.has("is-error"), true);
    assert.match(svg.attrs["data-geo-error"] ?? "", /GeometryError/);
    // rolled back: D is back at the original midpoint
    assert.equal(JSON.stringify(doc.objects.get("D").geometry), geomBefore);

    // next legal interaction clears the error
    const target = { x: b.x + 40, y: b.y };
    svg.dispatch("pointermove", dragEvent(target.x, target.y));
    svg.dispatch("pointerup", dragEvent(target.x, target.y));
    assert.equal(svg.classSet.has("is-error"), false);
    assert.ok(scene.innerHTMLValue, "scene re-rendered after recovery");
});

test("label drag applies translate to the label node after re-render", () => {
    const { svg, scene } = stubSvg("A = (0,0)\nB = (6,0)\nAB\nlabel A");
    const controller = mount(svg, stubDom);
    const doc = controller.doc;

    // pretend the scene has the rendered label node (innerHTML replacement in
    // the stub empties children, so install one for selector lookups)
    const labelNode = el("g", { "data-geo-label": "A" });
    const pointNode = el("g", { "data-geo-name": "A", "data-geo-kind": "Point" });
    scene.children.push(labelNode, pointNode);

    const s = screenOf(doc, "A");
    const labelPos = { x: s.x + 8, y: s.y - 8 };
    svg.dispatch("pointerdown", dragEvent(labelPos.x, labelPos.y));
    assert.equal(controller.session.dragging.type, "label");
    svg.dispatch("pointermove", dragEvent(labelPos.x + 12, labelPos.y + 9));
    assert.equal(labelNode.attrs.transform, "translate(12 9)");

    svg.dispatch("pointerup", dragEvent(labelPos.x + 12, labelPos.y + 9));
    // offsets re-applied after any re-render
    controller.render();
    assert.equal(labelNode.attrs.transform, "translate(12 9)");
});

test("selection class applied to all matching nodes and cleared on empty click", () => {
    // no medians: the centroid is strictly inside, away from every stroke
    const { svg, scene } = stubSvg("A = (0,0)\nB = (6,0)\nC = (2,4)\nABC");
    const controller = mount(svg, stubDom);
    const doc = controller.doc;

    const fill = el("g", { "data-geo-name": "ABC", "data-geo-kind": "Polygon" });
    const outline = el("g", { "data-geo-name": "ABC", "data-geo-kind": "Polygon" });
    scene.children.push(fill, outline);

    const a = screenOf(doc, "A");
    const b = screenOf(doc, "B");
    const c = screenOf(doc, "C");
    const inside = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    svg.dispatch("pointerdown", dragEvent(inside.x, inside.y));
    controller.applySelection();
    assert.equal(controller.session.selected, "ABC");
    assert.ok(fill.classSet.has("is-selected"));
    assert.ok(outline.classSet.has("is-selected"));

    svg.dispatch("pointerup", dragEvent(inside.x, inside.y));
    svg.dispatch("pointerdown", dragEvent(1, 1));
    controller.applySelection();
    assert.ok(!fill.classSet.has("is-selected"));
    assert.ok(!outline.classSet.has("is-selected"));
});

test("pointercancel rolls back an in-flight drag", () => {
    const { svg } = stubSvg("A = (0,0)\nB = (6,0)\nAB\nD = mid(AB)");
    const controller = mount(svg, stubDom);
    const doc = controller.doc;
    const geomBefore = JSON.stringify(doc.objects.get("D").geometry);

    const b = screenOf(doc, "B");
    svg.dispatch("pointerdown", dragEvent(b.x, b.y));
    svg.dispatch("pointermove", dragEvent(b.x + 50, b.y + 50));
    svg.dispatch("pointercancel", dragEvent(b.x + 50, b.y + 50));

    assert.equal(JSON.stringify(doc.objects.get("D").geometry), geomBefore);
    assert.ok(!svg.classSet.has("is-dragging"));
});
