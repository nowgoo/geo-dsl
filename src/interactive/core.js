/**
 * Interactive runtime core (spec_v0.3 §5, plan M2/M5) — pure, DOM-free,
 * testable in Node. Orchestrates: rehydration, hit testing, the drag state
 * machine, transform freezing, snapshot/rollback and recomputation via the
 * engine's pure evaluate()/layout() pipeline.
 *
 * Coordinates: all functions work in SVG user units (the svg viewBox space);
 * the DOM adapter converts client coordinates before calling in.
 */

import { documentFromPayload } from "../ir/serialize.js";
import { Point } from "../ir/geometry.js";
import { evaluate } from "../engine/evaluate.js";
import { layout, toWorld } from "../layout/viewport.js";
import { checkConstraints } from "../engine/constraints.js";
import { solveConstraints } from "../solver/solve.js";
import { toScreen } from "../render/svg/geometry.js";

export const HIT = {
    POINT_RADIUS_PX: 8,
    STROKE_RADIUS_PX: 6,
    LABEL_RADIUS_PX: 12,
    ARC_SAMPLES: 16,
};

/**
 * payload -> live Document: rehydrate, seed solved unknown points, evaluate
 * the full construction graph. The payload transform is kept (initial paint
 * is the static SVG; no re-layout) (spec_v0.3 §2).
 */
export function createInteractiveDocument(payload) {
    const doc = documentFromPayload(payload);
    evaluate(doc);
    return doc;
}

/** names of draggable points (free literal points + unknown points, §5.1) */
export function draggablePoints(doc) {
    const names = new Set();
    for (const object of doc.objects.values()) {
        const t = object.definition.type;
        if (t === "PointLiteralDefinition" || t === "UnknownPointDefinition") {
            names.add(object.name);
        }
    }
    return names;
}

/**
 * Math hit test (spec_v0.3 §5.2), reverse render order (§39):
 * label > point > stroke (segment/polyline/line/ray/circle/arc/polygon edge)
 * > polygon fill.
 *
 * @returns {{kind: string, name: string, distance: number} | null}
 */
export function hitTest(doc, svgPoint, { labelOffsets = null } = {}) {
    const t = doc.transform;
    if (!t) return null;
    const candidates = [];

    // labels (top-most): resolved position + resolved offset + client drag offset
    for (const label of doc.labels) {
        if (!label.resolved) continue;
        const s = toScreen(t, { x: label.resolved.x, y: label.resolved.y });
        const drag = labelOffsets?.get(label.target.name) ?? { x: 0, y: 0 };
        const d = Math.hypot(s.x + label.resolved.offset.x + drag.x - svgPoint.x,
                             s.y + label.resolved.offset.y + drag.y - svgPoint.y);
        if (d <= HIT.LABEL_RADIUS_PX) {
            candidates.push({ kind: "label", name: label.target.name, distance: d });
        }
    }

    for (const object of doc.objects.values()) {
        const g = object.geometry;
        if (!g) continue;
        if (g.type === "Point") {
            const s = toScreen(t, g);
            const d = Math.hypot(s.x - svgPoint.x, s.y - svgPoint.y);
            if (d <= HIT.POINT_RADIUS_PX) {
                candidates.push({ kind: "point", name: object.name, distance: d });
            }
        }
    }

    // strokes: nearest among all stroked objects
    let bestStroke = null;
    for (const object of doc.objects.values()) {
        const d = strokeDistance(object, t, svgPoint);
        if (d !== null && d <= HIT.STROKE_RADIUS_PX) {
            if (!bestStroke || d < bestStroke.distance) {
                bestStroke = { kind: "stroke", name: object.name, distance: d };
            }
        }
    }
    if (bestStroke) candidates.push(bestStroke);

    // polygon fills (lowest priority): first (in document order) containing point
    for (const object of doc.objects.values()) {
        const g = object.geometry;
        if (g?.type === "Polygon" && pointInPolygon(g.points, svgPoint, t)) {
            candidates.push({ kind: "fill", name: object.name, distance: 0 });
            break;
        }
    }

    if (!candidates.length) return null;
    const rank = { label: 0, point: 1, stroke: 2, fill: 3 };
    candidates.sort((a, b) => rank[a.kind] - rank[b.kind] || a.distance - b.distance);
    return candidates[0];
}

/** min screen distance from svgPoint to the object's stroked geometry, or null */
function strokeDistance(object, t, p) {
    const g = object.geometry;
    switch (g.type) {
        case "Segment":
            return segmentDistance(g.a, g.b, t, p);
        case "Polyline": {
            let best = null;
            for (let i = 0; i < g.points.length - 1; i++) {
                const d = segmentDistance(g.points[i], g.points[i + 1], t, p);
                if (d !== null && (best === null || d < best)) best = d;
            }
            return best;
        }
        case "Line":
        case "Ray": {
            const seg = object.clippedGeometry;
            return seg ? segmentDistance(seg.a, seg.b, t, p) : null;
        }
        case "Polygon": {
            let best = null;
            for (let i = 0; i < g.points.length; i++) {
                const d = segmentDistance(g.points[i], g.points[(i + 1) % g.points.length], t, p);
                if (d !== null && (best === null || d < best)) best = d;
            }
            return best;
        }
        case "Circle": {
            const s = toScreen(t, g.center);
            return Math.abs(Math.hypot(s.x - p.x, s.y - p.y) - g.radius * t.scale);
        }
        case "Arc": {
            let best = null;
            const n = HIT.ARC_SAMPLES;
            for (let i = 0; i <= n; i++) {
                const angle = g.ccw
                    ? g.startAngle + (g.sweep * i) / n
                    : g.startAngle - (g.sweep * i) / n;
                const s = toScreen(t, {
                    x: g.center.x + g.radius * Math.cos(angle),
                    y: g.center.y + g.radius * Math.sin(angle),
                });
                const d = Math.hypot(s.x - p.x, s.y - p.y);
                if (best === null || d < best) best = d;
            }
            return best;
        }
        default:
            return null;
    }
}

function segmentDistance(a, b, t, p) {
    const sa = toScreen(t, a);
    const sb = toScreen(t, b);
    const dx = sb.x - sa.x;
    const dy = sb.y - sa.y;
    const len2 = dx * dx + dy * dy;
    let u = len2 > 0 ? ((p.x - sa.x) * dx + (p.y - sa.y) * dy) / len2 : 0;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(sa.x + u * dx - p.x, sa.y + u * dy - p.y);
}

function pointInPolygon(points, p, t) {
    let inside = false;
    let prev = toScreen(t, points[points.length - 1]);
    for (const point of points) {
        const cur = toScreen(t, point);
        if (
            (cur.y > p.y) !== (prev.y > p.y) &&
            p.x < ((prev.x - cur.x) * (p.y - cur.y)) / (prev.y - cur.y) + cur.x
        ) {
            inside = !inside;
        }
        prev = cur;
    }
    return inside;
}

/**
 * Drag/click state machine for one mounted figure.
 *
 * - begin(hit, svgPoint): start dragging (draggable point / label) or just
 *   select. Freezes the transform for point drags (§5.4).
 * - move(svgPoint): apply drag; re-evaluates the full graph; on engine error
 *   rolls back to the begin snapshot and reports the error.
 * - end(): unfreeze (layout) + per-mode checks (assert: constraint check,
 *   solve: warm-started re-solve).
 * - cancel(): rollback + relayout.
 */
export function createSession(doc, { mode = "free" } = {}) {
    const draggable = draggablePoints(doc);
    const labelOffsets = new Map(); // name -> {x, y} client drag offset (svg px)
    let selected = null;
    let drag = null; // { type: "point"|"label", name }
    let snapshot = null;
    let lastPoint = null;
    let frozenTransform = null;

    const session = {
        get selected() {
            return selected;
        },
        get dragging() {
            return drag;
        },
        get labelOffsets() {
            return labelOffsets;
        },

        begin(hit, svgPoint) {
            if (drag) session.cancel(); // robustness: implicit cancel on re-begin
            lastPoint = svgPoint;
            selected = hit ? hit.name : null;

            if (hit?.kind === "label") {
                drag = { type: "label", name: hit.name };
                if (!labelOffsets.has(hit.name)) labelOffsets.set(hit.name, { x: 0, y: 0 });
                return { started: true, type: "label" };
            }
            if (hit?.kind === "point" && draggable.has(hit.name)) {
                drag = { type: "point", name: hit.name };
                frozenTransform = doc.transform; // layout() below replaces doc.transform
                snapshot = takeSnapshot(doc);
                return { started: true, type: "point" };
            }
            return { started: false };
        },

        move(svgPoint) {
            if (!drag) return { changed: false };
            const dx = svgPoint.x - lastPoint.x;
            const dy = svgPoint.y - lastPoint.y;
            lastPoint = svgPoint;

            if (drag.type === "label") {
                const off = labelOffsets.get(drag.name);
                off.x += dx;
                off.y += dy;
                return { changed: true, label: drag.name };
            }

            // point drag: inverse transform under the frozen transform
            const world = toWorld(frozenTransform, svgPoint);
            const object = doc.objects.get(drag.name);
            if (object.definition.type === "UnknownPointDefinition") {
                object.geometry = new Point(world.x, world.y);
            } else {
                // a free point's definition IS its position (spec_v0.3 §1):
                // rewrite the literal as plain NumberExpr values
                object.definition.x = { type: "NumberExpr", value: world.x };
                object.definition.y = { type: "NumberExpr", value: world.y };
            }
            try {
                evaluate(doc);
                return { changed: true };
            } catch (error) {
                restore(doc, snapshot);
                evaluate(doc);
                return { changed: true, error: describeError(error) };
            }
        },

        end() {
            if (!drag) return { changed: false };
            if (drag.type === "label") {
                // label drags change no geometry; offsets persist client-side
                drag = null;
                return { changed: false };
            }
            drag = null;
            try {
                layout(doc);
                if (mode === "assert") {
                    checkConstraints(doc);
                } else if (mode === "solve") {
                    solveConstraints(doc, { warmStart: warmStartMap(doc) });
                }
                return { changed: true };
            } catch (error) {
                restore(doc, snapshot);
                evaluate(doc);
                layout(doc);
                return { changed: true, error: describeError(error) };
            } finally {
                snapshot = null;
                frozenTransform = null;
            }
        },

        cancel() {
            if (!drag) return { changed: false };
            if (drag.type === "label") {
                drag = null;
                return { changed: false };
            }
            drag = null;
            restore(doc, snapshot);
            evaluate(doc);
            layout(doc);
            snapshot = null;
            frozenTransform = null;
            return { changed: true };
        },
    };
    return session;
}

function warmStartMap(doc) {
    const map = new Map();
    for (const name of doc.unknowns) {
        const g = doc.objects.get(name)?.geometry;
        if (g) map.set(name, { x: g.x, y: g.y });
    }
    return map;
}

function takeSnapshot(doc) {
    const objects = {};
    for (const [name, object] of doc.objects) {
        objects[name] = {
            geometry: JSON.parse(JSON.stringify(object.geometry)),
            definition: JSON.parse(JSON.stringify(object.definition)),
        };
    }
    return { objects, transform: { ...doc.transform } };
}

function restore(doc, snapshot) {
    for (const [name, state] of Object.entries(snapshot.objects)) {
        const object = doc.objects.get(name);
        if (!object) continue;
        object.geometry = JSON.parse(JSON.stringify(state.geometry));
        object.definition = JSON.parse(JSON.stringify(state.definition));
    }
    doc.transform = { ...snapshot.transform };
}

function describeError(error) {
    return error?.message ? `${error.name ?? "Error"}: ${error.message}` : String(error);
}
