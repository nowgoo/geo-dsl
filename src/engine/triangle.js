/**
 * Triangle geometry (spec §24): centroid, circumcenter/circle, incenter/circle.
 */

import { Point, Circle } from "../ir/geometry.js";
import { EPSILON, near } from "./epsilon.js";
import { GeometryErrorDSLError } from "../errors.js";
import { distance, polygonArea, polygonPerimeter, sub, cross } from "./primitives.js";

function trianglePoints(a, b, c, what) {
    if (distance(a, b) < EPSILON || distance(b, c) < EPSILON || distance(c, a) < EPSILON) {
        throw new GeometryErrorDSLError(`cannot construct ${what}: degenerate triangle`);
    }
    // collinearity via cross product
    const area2 = Math.abs(cross(sub(b, a), sub(c, a)));
    if (area2 < EPSILON) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: collinear triangle`,
        );
    }
    return { a, b, c };
}

export function centroid(a, b, c) {
    return new Point((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3);
}

export function circumcenter(a, b, c, what = "circumcenter") {
    trianglePoints(a, b, c, what);
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (near(d, 0)) {
        throw new GeometryErrorDSLError(`cannot construct ${what}: collinear triangle`);
    }
    const a2 = a.x * a.x + a.y * a.y;
    const b2 = b.x * b.x + b.y * b.y;
    const c2 = c.x * c.x + c.y * c.y;
    const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    return new Point(ux, uy);
}

export function circumcircle(a, b, c, what = "circumcircle") {
    const center = circumcenter(a, b, c, what);
    return new Circle(center, distance(center, a));
}

export function incenter(a, b, c, what = "incenter") {
    trianglePoints(a, b, c, what);
    const lenA = distance(b, c); // side opposite A
    const lenB = distance(c, a);
    const lenC = distance(a, b);
    const sum = lenA + lenB + lenC;
    return new Point(
        (lenA * a.x + lenB * b.x + lenC * c.x) / sum,
        (lenA * a.y + lenB * b.y + lenC * c.y) / sum,
    );
}

export function incircle(a, b, c, what = "incircle") {
    const center = incenter(a, b, c, what);
    const area = polygonArea([a, b, c]);
    const s = polygonPerimeter([a, b, c]) / 2;
    if (!(s > EPSILON)) {
        throw new GeometryErrorDSLError(`cannot construct ${what}: degenerate triangle`);
    }
    return new Circle(center, area / s);
}
