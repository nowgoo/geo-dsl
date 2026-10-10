/**
 * Automatic layout (spec §32) + infinite-line clipping (§33, plan D15).
 *
 * Produces document.transform = { scale, ox, oy }:
 *   svgX = ox + scale * x
 *   svgY = oy - scale * y        (Y flip happens here and only here, §41)
 *
 * Line / Ray objects receive object.clippedGeometry = Segment in world
 * coordinates, clipped to the visible world rect (Liang-Barsky).
 */

import { Segment } from "../ir/geometry.js";
import { EPSILON } from "../engine/epsilon.js";
import { ArgumentErrorDSLError } from "../errors.js";
import { geometryBounds } from "./bounds.js";
import { add, sub, scale as vscale, dot, lengthOf } from "../engine/primitives.js";

export function layout(document) {
    const canvas = document.canvas;
    if (!(canvas.width > 0) || !(canvas.height > 0) || !(canvas.padding >= 0)) {
        throw new ArgumentErrorDSLError("canvas width/height must be positive and padding non-negative");
    }

    // 1. bounds of all finite geometry
    let bounds = unionBounds(finiteObjects(document).map((o) => geometryBounds(o.geometry)));

    // 2. documents with only infinite geometry: seed from anchors
    const infinite = infiniteObjects(document);
    if (!bounds) {
        const anchors = [];
        for (const object of infinite) {
            const g = object.geometry;
            anchors.push(g.type === "Line" ? g.point : g.origin);
        }
        if (anchors.length) {
            bounds = unionBounds(anchors.map((p) => ({ minX: p.x - 1, minY: p.y - 1, maxX: p.x + 1, maxY: p.y + 1 })));
        }
    }

    // 3. fully empty document
    if (!bounds) {
        bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    }

    // 4-6. uniform scale, keep aspect ratio, center
    const pad = canvas.padding;
    const availW = canvas.width - 2 * pad;
    const availH = canvas.height - 2 * pad;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;

    let scaleX = w > EPSILON ? availW / w : Infinity;
    let scaleY = h > EPSILON ? availH / h : Infinity;
    let scale = Math.min(scaleX, scaleY);
    if (!Number.isFinite(scale)) {
        scale = 1; // degenerate bounds (single point)
    }

    const drawnW = w * scale;
    const drawnH = h * scale;
    const offsetX = pad + (availW - drawnW) / 2;
    const offsetY = pad + (availH - drawnH) / 2;

    // svgX = ox + scale*x ; svgY = oy - scale*y
    document.transform = {
        scale,
        ox: offsetX - scale * bounds.minX,
        oy: canvas.height - (offsetY - scale * bounds.minY),
    };

    // 7. clip infinite geometry to the visible world rect
    const world = visibleWorldRect(document);
    for (const object of infinite) {
        object.clippedGeometry = clipToRect(object.geometry, world);
    }

    return document;
}

function finiteObjects(document) {
    const out = [];
    for (const object of document.objects.values()) {
        if (object.geometry && object.geometry.type !== "Line" && object.geometry.type !== "Ray") {
            out.push(object);
        }
    }
    return out;
}

function infiniteObjects(document) {
    const out = [];
    for (const object of document.objects.values()) {
        if (object.geometry && (object.geometry.type === "Line" || object.geometry.type === "Ray")) {
            out.push(object);
        }
    }
    return out;
}

function unionBounds(list) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of list) {
        if (!b) continue;
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
}

/**
 * screen point -> world point: exact inverse of the §41 transform
 * (spec_v0.3 §6). Same Y-flip point mirrored.
 */
export function toWorld(transform, s) {
    return {
        x: (s.x - transform.ox) / transform.scale,
        y: (transform.oy - s.y) / transform.scale,
    };
}

/** world-coordinate rectangle currently visible on the canvas */
function visibleWorldRect(document) {
    const { scale, ox, oy } = document.transform;
    return {
        minX: (0 - ox) / scale,
        maxX: (document.canvas.width - ox) / scale,
        minY: (oy - document.canvas.height) / scale,
        maxY: oy / scale,
    };
}

/** Liang-Barsky clip of an infinite line/ray against an axis-aligned rect */
export function clipToRect(geometry, rect) {
    let origin, direction;
    if (geometry.type === "Line") {
        origin = geometry.point;
        direction = geometry.direction;
    } else {
        origin = geometry.origin;
        direction = geometry.direction;
    }

    let t0 = geometry.type === "Line" ? -Infinity : 0;
    let t1 = Infinity;

    const p = [-direction.x, direction.x, -direction.y, direction.y];
    const q = [
        origin.x - rect.minX,
        rect.maxX - origin.x,
        origin.y - rect.minY,
        rect.maxY - origin.y,
    ];

    for (let i = 0; i < 4; i++) {
        if (Math.abs(p[i]) < EPSILON) {
            if (q[i] < 0) return null; // parallel and outside
            continue;
        }
        const t = q[i] / p[i];
        if (p[i] < 0) {
            t0 = Math.max(t0, t);
        } else {
            t1 = Math.min(t1, t);
        }
    }

    if (t0 > t1) return null;

    const a = add(origin, vscale(direction, t0));
    const b = add(origin, vscale(direction, t1));
    return new Segment(a, b);
}
