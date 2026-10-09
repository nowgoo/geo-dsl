/**
 * Mark rendering (spec §38): annotations drawn in screen space.
 *   right_angle  small square at the vertex
 *   equal_length tick marks at segment midpoints
 *   parallel     matched arrow chevrons at segment midpoints
 *   equal_angle  matched arcs at the angle vertices
 */

import { fmt } from "./format.js";
import { toScreen } from "./geometry.js";

const MARK_SIZE = 8; // px, screen space

export function renderMark(transform, mark, style) {
    switch (mark.kind) {
        case "right_angle":
            return renderRightAngle(transform, mark.resolved, style);
        case "equal_length":
            return renderEqualLength(transform, mark.resolved, style);
        case "parallel":
            return renderParallel(transform, mark.resolved, style);
        case "equal_angle":
            return renderEqualAngle(transform, mark.resolved, style);
        default:
            return "";
    }
}

function attrs(style) {
    return [
        `stroke="${style.stroke}"`,
        `stroke-width="${fmt(style.width)}"`,
        'fill="none"',
    ].join(" ");
}

function screen(transform, p) {
    return toScreen(transform, p);
}

function path(points) {
    const d = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p.x)} ${fmt(p.y)}`)
        .join(" ");
    return `<path d="${d}" ${attrs(currentStyle)}/>`;
}

let currentStyle = null;

export function setMarkStyle(style) {
    currentStyle = style;
}

// --- right angle: small square at vertex -----------------------------------------

function renderRightAngle(transform, resolved, style) {
    const { vertex, arm1, arm2 } = resolved;
    const v = screen(transform, vertex);
    const u1 = unitTo(v, screen(transform, arm1));
    const u2 = unitTo(v, screen(transform, arm2));
    const s = MARK_SIZE;
    const p1 = { x: v.x + u1.x * s, y: v.y + u1.y * s };
    const p2 = { x: v.x + (u1.x + u2.x) * s, y: v.y + (u1.y + u2.y) * s };
    const p3 = { x: v.x + u2.x * s, y: v.y + u2.y * s };
    return path([p1, p2, p3]);
}

// --- equal length: tick marks ------------------------------------------------------

function renderEqualLength(transform, segments, style) {
    return segments.map((segment) => {
        const a = screen(transform, segment.a);
        const b = screen(transform, segment.b);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const n = unitPerp(a, b);
        const s = MARK_SIZE / 2;
        const p1 = { x: mid.x - n.x * s, y: mid.y - n.y * s };
        const p2 = { x: mid.x + n.x * s, y: mid.y + n.y * s };
        return path([p1, p2]);
    }).join("");
}

// --- parallel: matched arrow chevrons -------------------------------------------------

function renderParallel(transform, segments, style) {
    return segments.map((segment) => {
        const a = screen(transform, segment.a);
        const b = screen(transform, segment.b);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const u = unitTo(a, b);
        const n = { x: -u.y, y: u.x };
        const L = MARK_SIZE;
        const W = MARK_SIZE / 2;
        const tip = { x: mid.x + u.x * (L / 2), y: mid.y + u.y * (L / 2) };
        const back = { x: mid.x - u.x * (L / 2), y: mid.y - u.y * (L / 2) };
        const w1 = { x: back.x + n.x * W, y: back.y + n.y * W };
        const w2 = { x: back.x - n.x * W, y: back.y - n.y * W };
        return path([w1, tip, w2]);
    }).join("");
}

// --- equal angle: matched arcs ---------------------------------------------------------

function renderEqualAngle(transform, resolved, style) {
    const r = MARK_SIZE + 2;
    const parts = [];
    for (const [a, b, c] of [resolved.first, resolved.second]) {
        parts.push(angleArcPath(transform, a, b, c, r));
    }
    return parts.join("");
}

function angleArcPath(transform, a, b, c, radiusPx) {
    const vb = screen(transform, b);
    const va = screen(transform, a);
    const vc = screen(transform, c);
    const u1 = unitTo(vb, va);
    const u2 = unitTo(vb, vc);
    const start = { x: vb.x + u1.x * radiusPx, y: vb.y + u1.y * radiusPx };
    const end = { x: vb.x + u2.x * radiusPx, y: vb.y + u2.y * radiusPx };
    // choose the inner (smaller) arc between the two arm directions
    const cross = u1.x * u2.y - u1.y * u2.x;
    const sweep = cross > 0 ? 1 : 0;
    return `<path d="M ${fmt(start.x)} ${fmt(start.y)} A ${radiusPx} ${radiusPx} 0 0 ${sweep} ${fmt(end.x)} ${fmt(end.y)}" ${attrs(currentStyle)}/>`;
}

// --- helpers -----------------------------------------------------------------------------

function unitTo(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
}

function unitPerp(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
}
