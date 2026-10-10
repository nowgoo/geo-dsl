/**
 * Interactive hover titles (spec_v0.3 §5.3): display formatting of already
 * evaluated IR geometry. Pure presentation — no construction, no solving,
 * no dependency handling (Rule 4); only trivial display arithmetic
 * (hypot/sum) on stored coordinates.
 */

import { fmt } from "./format.js";

export function titleFor(object) {
    const g = object.geometry;
    if (!g) return object.name;
    switch (g.type) {
        case "Point":
            return `${object.name} (${fmt(g.x)}, ${fmt(g.y)})`;
        case "Segment":
            return `${object.name} · length ${fmt(Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y))}`;
        case "Circle":
            return `${object.name} · radius ${fmt(g.radius)}`;
        case "Arc":
            return `${object.name} · radius ${fmt(g.radius)}`;
        case "Polygon":
            return `${object.name} · polygon (${g.points.length} vertices)`;
        case "Polyline":
            return `${object.name} · polyline (${g.points.length} points)`;
        default:
            return object.name;
    }
}
