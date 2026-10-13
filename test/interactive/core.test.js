/**
 * Interactive runtime core tests (spec_v0.3 §5, plan M2/M5) — pure, no DOM.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../../src/index.js";
import { documentToPayload } from "../../src/ir/serialize.js";
import { toScreen } from "../../src/render/svg/geometry.js";
import {
    createInteractiveDocument,
    hitTest,
    createSession,
    draggablePoints,
} from "../../src/interactive/core.js";

const MEDIANS = [
    "A = (0, 0)",
    "B = (6, 0)",
    "C = (2, 4)",
    "ABC",
    "D = mid(BC)",
    "E = mid(CA)",
    "AD",
    "BE",
    "G = AD * BE",
].join("\n");

function setup(source = MEDIANS) {
    const doc = createInteractiveDocument(documentToPayload(compile(source)));
    const session = createSession(doc);
    return { doc, session };
}

function screenOf(doc, name) {
    const object = doc.objects.get(name);
    return toScreen(doc.transform, object.geometry);
}

// --- createInteractiveDocument -----------------------------------------------------

test("rehydrate + evaluate produces the same geometry as compile", () => {
    const compiled = compile(MEDIANS);
    const doc = createInteractiveDocument(documentToPayload(compiled));
    for (const [name, object] of compiled.objects) {
        assert.deepEqual({ ...doc.objects.get(name).geometry }, { ...object.geometry });
    }
    assert.deepEqual(doc.transform, compiled.transform);
});

test("draggablePoints: literal free points only", () => {
    const { doc } = setup();
    const names = draggablePoints(doc);
    assert.deepEqual([...names].sort(), ["A", "B", "C"]);
});

// --- hitTest -----------------------------------------------------------------------

test("hitTest finds a point under the cursor", () => {
    const { doc } = setup();
    const s = screenOf(doc, "A");
    assert.equal(hitTest(doc, { x: s.x + 2, y: s.y + 2 })?.name, "A");
    assert.equal(hitTest(doc, { x: s.x + 2, y: s.y + 2 })?.kind, "point");
});

test("hitTest finds segments and circles by stroke distance", () => {
    const { doc } = setup("A = (0,0)\nB = (6,0)\nAB");
    // AB runs along y=0: midpoint of AB on screen
    const a = screenOf(doc, "A");
    const b = screenOf(doc, "B");
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const hit = hitTest(doc, { x: mid.x, y: mid.y + 4 }); // 4px off the stroke
    assert.equal(hit?.name, "AB");
    assert.equal(hit?.kind, "stroke");

    const source = "O = (0, 0)\nomega = circle(O, 3)";
    const doc2 = createInteractiveDocument(documentToPayload(compile(source)));
    const c = toScreen(doc2.transform, doc2.objects.get("O").geometry);
    const r = 3 * doc2.transform.scale;
    assert.equal(hitTest(doc2, { x: c.x + r, y: c.y })?.name, "omega");
});

test("hitTest: point wins over stroke, label wins over everything", () => {
    const { doc } = setup("A = (0,0)\nB = (6,0)\nAB\nlabel A");
    const s = screenOf(doc, "A");
    // A lies on stroke AB; 5px below A is on both point (8px) and stroke (6px):
    // the point must win. Label center is at (8,-8): dist hypot(6,13)>12, no label hit.
    const below = { x: s.x + 2, y: s.y + 5 };
    assert.equal(hitTest(doc, below)?.kind, "point");
    // cursor on the label glyph hits the label
    const label = { x: s.x + 8, y: s.y - 8 };
    assert.equal(hitTest(doc, label)?.kind, "label");
});

test("hitTest: polygon fill hit inside, miss outside", () => {
    const { doc } = setup();
    // centroid of ABC is strictly inside
    const a = screenOf(doc, "A");
    const b = screenOf(doc, "B");
    const c = screenOf(doc, "C");
    const inside = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    // move away from strokes: midpoint region contains stroke hits; nudge inside
    const hit = hitTest(doc, inside);
    assert.ok(hit, "expected some hit inside polygon");
    assert.ok(["fill", "stroke", "point"].includes(hit.kind));

    const far = { x: 5, y: 5 };
    assert.equal(hitTest(doc, far), null);
});

test("hitTest skips hidden objects and hidden-point labels", () => {
    const { doc } = setup(`
A = (0, 0)
B = (6, 0)
C = (2, 4)
D = mid(BC)
AB
label A
label D
hide D, AB
`);
    // cursor exactly on hidden point D: no point hit (falls through to other geometry)
    const d = screenOf(doc, "D");
    assert.notEqual(hitTest(doc, { x: d.x, y: d.y })?.name, "D");
    // cursor on hidden segment AB midpoint: no stroke hit
    const a = screenOf(doc, "A");
    const b = screenOf(doc, "B");
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    assert.notEqual(hitTest(doc, mid)?.name, "AB");
    // visible point A still hit-testable; its label is present
    assert.equal(hitTest(doc, { x: a.x + 2, y: a.y + 2 })?.name, "A");
    // hidden point D's label is not hit-testable
    const dLabel = { x: d.x + 8, y: d.y - 8 };
    assert.notEqual(hitTest(doc, dLabel)?.kind, "label");
});

test("hitTest respects client label offsets", () => {
    const { doc } = setup("A = (0,0)\nlabel A");
    const s = screenOf(doc, "A");
    const offsets = new Map([["A", { x: 50, y: 0 }]]);
    const atOriginal = { x: s.x + 8, y: s.y - 8 };
    const atMoved = { x: s.x + 50 + 8, y: s.y - 8 };
    assert.equal(hitTest(doc, atMoved, { labelOffsets: offsets })?.kind, "label");
    const hitOriginal = hitTest(doc, atOriginal, { labelOffsets: offsets });
    assert.notEqual(hitOriginal?.kind, "label");
});

// --- drag session: free points ------------------------------------------------------

test("dragging a free point recomputes derived objects (frozen transform)", () => {
    const { doc, session } = setup();
    const gBefore = { ...doc.objects.get("G").geometry };
    const start = screenOf(doc, "A");

    assert.equal(session.begin(hitTest(doc, start), start).type, "point");
    const transformBefore = doc.transform;

    const target = { x: start.x + 30, y: start.y + 30 }; // 30px right, 30px down
    session.move(target);
    assert.equal(session.dragging.type, "point");

    // derived centroid/intersection followed
    const gAfter = doc.objects.get("G").geometry;
    assert.notDeepEqual({ ...gAfter }, gBefore);

    // frozen transform: no layout during move (spec_v0.3 §5.4)
    assert.equal(doc.transform, transformBefore);

    const result = session.end();
    assert.equal(result.changed, true);
    assert.equal(result.error, undefined);
    assert.notEqual(doc.transform, transformBefore, "layout() re-derived transform");
});

test("drag respects the frozen transform mapping (world delta matches)", () => {
    const { doc, session } = setup();
    const start = screenOf(doc, "B");
    session.begin(hitTest(doc, start), start);
    const frozen = doc.transform;

    const target = { x: start.x + 12, y: start.y - 24 };
    session.move(target);

    const world = { x: (target.x - frozen.ox) / frozen.scale, y: (frozen.oy - target.y) / frozen.scale };
    const b = doc.objects.get("B").geometry;
    assert.ok(Math.abs(b.x - world.x) < 1e-9);
    assert.ok(Math.abs(b.y - world.y) < 1e-9);
    session.end();
});

test("dragging rewrites the literal definition as NumberExpr values", () => {
    const { doc, session } = setup();
    const start = screenOf(doc, "A");
    session.begin(hitTest(doc, start), start);
    session.move({ x: start.x + 10, y: start.y + 5 });
    session.end();
    const def = doc.objects.get("A").definition;
    assert.equal(def.type, "PointLiteralDefinition");
    assert.equal(def.x.type, "NumberExpr");
    assert.equal(def.y.type, "NumberExpr");
});

test("degenerate drag rolls back and reports the engine error", () => {
    const { doc, session } = setup("A = (0,0)\nB = (6,0)\nAB\nD = mid(AB)");
    const bStart = screenOf(doc, "B");
    const aScreen = screenOf(doc, "A");

    session.begin(hitTest(doc, bStart), bStart);
    const geomBefore = JSON.stringify([...doc.objects].map(([n, o]) => [n, o.geometry]));

    // drag B exactly onto A -> zero-length segment -> evaluate throws
    const result = session.move(aScreen);
    assert.ok(result.error, "expected rollback error");
    assert.match(result.error, /GeometryError|coincident|degenerate/i);

    // geometry restored to the pre-drag snapshot
    const geomAfter = JSON.stringify([...doc.objects].map(([n, o]) => [n, o.geometry]));
    assert.equal(geomAfter, geomBefore, "snapshot not restored");

    // session still usable afterwards
    const endResult = session.end();
    assert.equal(endResult.changed, true);
    assert.equal(endResult.error, undefined);
});

test("click selection: selectable objects and empty space", () => {
    const { doc, session } = setup("A = (0,0)\nB = (6,0)\nC = (2,4)\nABC");
    // click on draggable point A -> selection + active point drag
    const a = screenOf(doc, "A");
    session.begin(hitTest(doc, a), a);
    assert.equal(session.selected, "A");
    assert.equal(session.dragging.type, "point");
    session.cancel();

    // click on the polygon interior (fill or edge stroke, never empty) -> selection only
    const b = screenOf(doc, "B");
    const c = screenOf(doc, "C");
    const inside = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    const hit = hitTest(doc, inside);
    session.begin(hit, inside);
    assert.equal(session.selected, hit.name);
    assert.equal(session.dragging, null); // not draggable: selection only
    session.end();

    // empty space clears selection
    session.begin(null, { x: 1, y: 1 });
    assert.equal(session.selected, null);
});

// --- label drag ---------------------------------------------------------------------

test("label drag accumulates client offsets and leaves geometry alone", () => {
    const { doc, session } = setup("A = (0,0)\nB = (6,0)\nlabel A");
    const labelPos = { x: screenOf(doc, "A").x + 8, y: screenOf(doc, "A").y - 8 };
    const geomBefore = JSON.stringify([...doc.objects].map(([n, o]) => [n, o.geometry]));

    assert.equal(session.begin(hitTest(doc, labelPos), labelPos).type, "label");
    // move() takes absolute cursor positions; offsets accumulate deltas
    session.move({ x: labelPos.x + 15, y: labelPos.y + 7 });
    session.move({ x: labelPos.x + 30, y: labelPos.y + 14 });

    const off = session.labelOffsets.get("A");
    assert.deepEqual(off, { x: 30, y: 14 });

    const endResult = session.end();
    assert.equal(endResult.changed, false);
    const geomAfter = JSON.stringify([...doc.objects].map(([n, o]) => [n, o.geometry]));
    assert.equal(geomAfter, geomBefore, "label drag must not touch geometry");
});

// --- assert mode --------------------------------------------------------------------

test("assert mode: constraint violation on release rolls back", () => {
    const source = "A = (0,0)\nB = (4,0)\nC = (2,3)\nD = (6,3)\nAB // CD";
    const doc = createInteractiveDocument(documentToPayload(compile(source)));
    const session = createSession(doc, { mode: "assert" });

    const start = screenOf(doc, "D");
    session.begin(hitTest(doc, start), start);
    // move D so that CD is no longer parallel to AB
    session.move({ x: start.x + 20, y: start.y + 25 });

    const result = session.end();
    assert.ok(result.error, "expected constraint violation");
    assert.match(result.error, /constraint violated/);
    // rolled back
    const d = doc.objects.get("D").geometry;
    assert.deepEqual({ x: d.x, y: d.y }, { x: 6, y: 3 });
});

test("assert mode: legal drag passes checks", () => {
    const source = "A = (0,0)\nB = (4,0)\nC = (2,3)\nD = (6,3)\nAB // CD";
    const doc = createInteractiveDocument(documentToPayload(compile(source)));
    const session = createSession(doc, { mode: "assert" });

    // drag C along y=3 (CD stays horizontal => stays parallel)
    const start = screenOf(doc, "C");
    session.begin(hitTest(doc, start), start);
    const frozen = doc.transform;
    session.move({ x: start.x + 8, y: start.y + (0 * frozen.scale) });
    const result = session.end();
    assert.equal(result.error, undefined);
});

// --- solve mode (M5) ----------------------------------------------------------------

test("solve mode: dragging an unknown point warm-starts the solver", () => {
    const source = "A = (0,0)\nB = (4,0)\nC = ?\nAC = 3\nBC = 2";
    const doc = createInteractiveDocument(documentToPayload(compile(source)));
    const session = createSession(doc, { mode: "solve" });
    assert.ok(doc.objects.get("C").geometry, "solved seed present");

    const start = screenOf(doc, "C");
    session.begin(hitTest(doc, start), start);
    // drag C to the lower mirror solution region (x=0.5*AB... AB=4: x=0.5? solution x=(9-4)/8? no:
    // AC=3, BC=2, AB=4 -> x=(AC^2+AB^2-BC^2)/(2AB) = (9+16-4)/8 = 2.625, y=±2.704)
    const below = { x: toScreen(doc.transform, { x: 2.625, y: -2.704 }).x,
                    y: toScreen(doc.transform, { x: 2.625, y: -2.704 }).y };
    const moved = session.move(below);
    assert.equal(moved.changed, true);

    const result = session.end();
    assert.equal(result.error, undefined);
    const c = doc.objects.get("C").geometry;
    // constraints still hold: |AC|=3, |BC|=2 (mirrored to y<0)
    const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    const A = doc.objects.get("A").geometry;
    const B = doc.objects.get("B").geometry;
    assert.ok(Math.abs(d(c, A) - 3) < 1e-6, `|AC| = ${d(c, A)}`);
    assert.ok(Math.abs(d(c, B) - 2) < 1e-6, `|BC| = ${d(c, B)}`);
    assert.ok(c.y < 0, "moved to the dragged (lower) solution branch");
});

test("solve mode: unsatisfiable drag rolls back", () => {
    const source = "A = (0,0)\nB = (4,0)\nC = ?\nAC = 3\nBC = 2";
    const doc = createInteractiveDocument(documentToPayload(compile(source)));
    const session = createSession(doc, { mode: "solve" });

    const start = screenOf(doc, "A");
    session.begin(hitTest(doc, start), start);
    // drag A far left: |AB| > 5 makes |AC|=3, |BC|=2 impossible (800px ≈ 5.7 world)
    session.move({ x: start.x - 800, y: start.y });

    const result = session.end();
    assert.ok(result.error, "expected solver failure");
    const a = doc.objects.get("A").geometry;
    assert.deepEqual({ x: a.x, y: a.y }, { x: 0, y: 0 }, "rolled back");
});

// --- misc ---------------------------------------------------------------------------

test("begin on empty space clears selection", () => {
    const { doc, session } = setup();
    session.begin(hitTest(doc, screenOf(doc, "A")), screenOf(doc, "A"));
    assert.equal(session.selected, "A");
    session.begin(null, { x: 1, y: 1 });
    assert.equal(session.selected, null);
    assert.equal(session.dragging, null);
});
