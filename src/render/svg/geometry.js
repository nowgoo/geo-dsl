/**
 * Geometry element emission (spec §39, §40, §41).
 * All coordinates pass through the document transform (Y flip here only).
 */

import { fmt } from "./format.js";

/**
 * screen point from world point
 */
export function toScreen(transform, p) {
    return {
        x: transform.ox + transform.scale * p.x,
        y: transform.oy - transform.scale * p.y,
    };
}

function applyStyleProps(attrs, style, keys) {
    for (const key of keys) {
        if (style[key] === undefined) continue;
        switch (key) {
            case "stroke":
                attrs.push(`stroke="${style.stroke}"`);
                break;
            case "fill":
                attrs.push(`fill="${style.fill}"`);
                break;
            case "width":
                attrs.push(`stroke-width="${fmt(style.width)}"`);
                break;
            case "opacity":
                attrs.push(`opacity="${fmt(style.opacity)}"`);
                break;
            case "dash":
                attrs.push(`stroke-dasharray="${style.dash.map(fmt).join(" ")}"`);
                break;
            case "cap":
                attrs.push(`stroke-linecap="${style.cap}"`);
                break;
            case "join":
                attrs.push(`stroke-linejoin="${style.join}"`);
                break;
        }
    }
}

function strokeAttrs(style) {
    const attrs = [];
    applyStyleProps(attrs, style, ["stroke", "width", "opacity", "dash", "cap", "join"]);
    return attrs;
}

// module-level transform is set per render (single-threaded, deterministic)
let currentTransform = null;

export function setTransform(transform) {
    currentTransform = transform;
}

function toScreenPoint(p) {
    return toScreen(currentTransform, p);
}

export function renderLine(object, style) {
    const segment = object.clippedGeometry ?? object.geometry;
    return endpointsLine(segment.a, segment.b, style);
}

export function renderRay(object, style) {
    const segment = object.clippedGeometry ?? object.geometry;
    return endpointsLine(segment.a, segment.b, style);
}

export function renderSegment(object, style) {
    const g = object.geometry;
    return endpointsLine(g.a, g.b, style);
}

export function renderPolyline(object, style) {
    const pts = object.geometry.points.map(toScreenPoint);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p.x)} ${fmt(p.y)}`).join(" ");
    return `<path d="${d}" ${strokeAttrs(style).join(" ")} fill="none"/>`;
}

function endpointsLine(a, b, style) {
    const sa = toScreenPoint(a);
    const sb = toScreenPoint(b);
    return `<line x1="${fmt(sa.x)}" y1="${fmt(sa.y)}" x2="${fmt(sb.x)}" y2="${fmt(sb.y)}" ${strokeAttrs(style).join(" ")}/>`;
}

export function renderCircle(object, style) {
    const c = object.geometry;
    const s = toScreenPoint(c.center);
    const r = c.radius * currentTransform.scale;
    const attrs = [`cx="${fmt(s.x)}"`, `cy="${fmt(s.y)}"`, `r="${fmt(r)}"`];
    attrs.push(`fill="${style.fill ?? "none"}"`);
    attrs.push(...strokeAttrs(style));
    return `<circle ${attrs.join(" ")}/>`;
}

export function renderArc(object, style) {
    const arc = object.geometry;
    const t = currentTransform;
    const start = {
        x: arc.center.x + arc.radius * Math.cos(arc.startAngle),
        y: arc.center.y + arc.radius * Math.sin(arc.startAngle),
    };
    const end = {
        x: arc.center.x + arc.radius * Math.cos(arc.endAngle),
        y: arc.center.y + arc.radius * Math.sin(arc.endAngle),
    };
    const ss = toScreen(t, start);
    const se = toScreen(t, end);
    const r = fmt(arc.radius * t.scale);
    // world-ccw arc becomes clockwise in screen space (Y flipped): sweep=0
    const sweep = arc.ccw ? 0 : 1;
    const largeArc = 0; // minor arc <= 180 degrees
    return `<path d="M ${fmt(ss.x)} ${fmt(ss.y)} A ${r} ${r} 0 ${largeArc} ${sweep} ${fmt(se.x)} ${fmt(se.y)}" ${strokeAttrs(style).join(" ")} fill="none"/>`;
}

export function renderPolygonFill(object, style) {
    const attrs = [`points="${polygonPointsAttr(object)}"`];
    attrs.push(`fill="${style.fill ?? "none"}"`);
    attrs.push('stroke="none"');
    return `<polygon ${attrs.join(" ")}/>`;
}

export function renderPolygonOutline(object, style) {
    const attrs = [`points="${polygonPointsAttr(object)}"`];
    attrs.push('fill="none"');
    attrs.push(...strokeAttrs(style));
    return `<polygon ${attrs.join(" ")}/>`;
}

function polygonPointsAttr(object) {
    return object.geometry.points
        .map(toScreenPoint)
        .map((p) => `${fmt(p.x)},${fmt(p.y)}`)
        .join(" ");
}

export function renderPoint(object, style) {
    const s = toScreenPoint(object.geometry);
    const attrs = [
        `cx="${fmt(s.x)}"`,
        `cy="${fmt(s.y)}"`,
        `r="${fmt(style.radius ?? 4)}"`,
    ];
    attrs.push(`fill="${style.fill ?? "#222222"}"`);
    if (style.stroke) {
        attrs.push(...strokeAttrs(style));
    }
    return `<circle ${attrs.join(" ")}/>`;
}
