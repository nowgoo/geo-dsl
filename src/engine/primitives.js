/**
 * Core geometric primitives: vector ops, constructions, transforms,
 * degeneracy checks (spec §21-23, §28).
 */

import { Point, Vector, Line, Segment, Ray, Circle, Arc, Polygon, Polyline } from "../ir/geometry.js";
import { EPSILON, near, isFiniteNumber } from "./epsilon.js";
import { GeometryErrorDSLError } from "../errors.js";

export { Point, Vector, Line, Segment, Ray, Circle, Arc, Polygon, Polyline };

// --- vector ops -----------------------------------------------------------

export function add(a, b) {
    return new Point(a.x + b.x, a.y + b.y);
}

export function sub(a, b) {
    return new Vector(a.x - b.x, a.y - b.y);
}

export function scale(v, k) {
    return new Vector(v.x * k, v.y * k);
}

export function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}

export function cross(a, b) {
    return a.x * b.y - a.y * b.x;
}

export function lengthOf(v) {
    return Math.hypot(v.x, v.y);
}

export function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalize(v) {
    const len = lengthOf(v);
    if (len < EPSILON) {
        return null;
    }
    return new Vector(v.x / len, v.y / len);
}

export function perp(v) {
    return new Vector(-v.y, v.x);
}

// --- degeneracy helpers ------------------------------------------------------

function checkFinite(...values) {
    for (const v of values) {
        if (!isFiniteNumber(v)) {
            throw new GeometryErrorDSLError("non-finite value in geometric construction");
        }
    }
}

// --- constructions (§21 basic, §22 constructions) ------------------------------

/** segment(A, B) with zero-length check (§28) */
export function makeSegment(a, b, what = "segment") {
    checkFinite(a.x, a.y, b.x, b.y);
    if (distance(a, b) < EPSILON) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: points are coincident`,
        );
    }
    return new Segment(a, b);
}

/** line through two points (point + unit direction) */
export function makeLine(a, b, what = "line") {
    checkFinite(a.x, a.y, b.x, b.y);
    const direction = normalize(sub(b, a));
    if (!direction) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: direction is zero`,
        );
    }
    return new Line(a, direction);
}

export function makeRay(origin, through, what = "ray") {
    checkFinite(origin.x, origin.y, through.x, through.y);
    const direction = normalize(sub(through, origin));
    if (!direction) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: direction is zero`,
        );
    }
    return new Ray(origin, direction);
}

export function makeCircle(center, radius, what = "circle") {
    checkFinite(center.x, center.y, radius);
    if (!(radius > EPSILON)) {
        throw new GeometryErrorDSLError(`cannot construct ${what}: zero radius`);
    }
    return new Circle(center, radius);
}

/**
 * arc(O, A, B): minor arc from A to B (§28).
 * - |OA| != |OB|        -> GeometryError (radius mismatch)
 * - A == B              -> GeometryError (degenerate)
 * - antipodal endpoints -> GeometryError (minor arc not unique)
 */
export function makeArc(center, a, b, what = "arc") {
    const ra = distance(center, a);
    const rb = distance(center, b);
    if (!near(ra, rb)) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: radius mismatch (|OA| = ${ra}, |OB| = ${rb})`,
        );
    }
    if (ra < EPSILON) {
        throw new GeometryErrorDSLError(`cannot construct ${what}: degenerate radius`);
    }

    const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
    const endAngleRaw = Math.atan2(b.y - center.y, b.x - center.x);

    let ccwSweep = endAngleRaw - startAngle;
    while (ccwSweep <= 0) ccwSweep += 2 * Math.PI;
    while (ccwSweep > 2 * Math.PI) ccwSweep -= 2 * Math.PI;

    if (near(ccwSweep, 0) || near(ccwSweep, 2 * Math.PI)) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: endpoints coincide`,
        );
    }

    let ccw;
    let sweep;
    if (ccwSweep <= Math.PI + EPSILON && !near(ccwSweep, Math.PI)) {
        ccw = true;
        sweep = ccwSweep;
    } else if (near(ccwSweep, Math.PI)) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: endpoints are antipodal, minor arc is not unique`,
        );
    } else {
        // minor arc runs clockwise from A
        ccw = false;
        sweep = 2 * Math.PI - ccwSweep;
    }

    const endAngle = ccw ? startAngle + sweep : startAngle - sweep;
    return new Arc(center, ra, startAngle, endAngle, ccw);
}

export function makePolygon(points, what = "polygon") {
    if (points.length < 3) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: at least 3 points required`,
        );
    }
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            if (distance(points[i], points[j]) < EPSILON) {
                throw new GeometryErrorDSLError(
                    `cannot construct ${what}: duplicate vertices`,
                );
            }
        }
    }
    return new Polygon(points);
}

export function makePolyline(points, what = "polyline") {
    if (points.length < 2) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: at least 2 points required`,
        );
    }
    for (let i = 1; i < points.length; i++) {
        if (distance(points[i - 1], points[i]) < EPSILON) {
            throw new GeometryErrorDSLError(
                `cannot construct ${what}: consecutive duplicate vertices`,
            );
        }
    }
    return new Polyline(points);
}

export function midpoint(a, b) {
    return new Point((a.x + b.x) / 2, (a.y + b.y) / 2);
}

/** perpendicular(A, l): line through A perpendicular to l */
export function perpendicularThrough(point, line) {
    return new Line(point, perp(line.direction));
}

/** parallel(A, l): line through A parallel to l */
export function parallelThrough(point, line) {
    return new Line(point, line.direction);
}

/** perpendicular_bisector(AB) */
export function perpendicularBisector(a, b, what = "perpendicular bisector") {
    const direction = normalize(sub(b, a));
    if (!direction) {
        throw new GeometryErrorDSLError(`cannot construct ${what}: points are coincident`);
    }
    return new Line(midpoint(a, b), perp(direction));
}

/**
 * angle_bisector(A, B, C): internal bisector at B.
 * Collinear (degenerate) angle -> GeometryError (§28).
 */
export function angleBisector(a, b, c, what = "angle bisector") {
    const u = normalize(sub(a, b));
    const v = normalize(sub(c, b));
    if (!u || !v) {
        throw new GeometryErrorDSLError(`cannot construct ${what}: degenerate angle`);
    }
    const bisector = normalize(add(u, v));
    if (!bisector || near(cross(u, v), 0)) {
        throw new GeometryErrorDSLError(
            `cannot construct ${what}: degenerate (collinear) angle`,
        );
    }
    return new Line(b, bisector);
}

/** projection(A, l): foot of the perpendicular from A to l */
export function projection(point, line) {
    const t = dot(sub(point, line.point), line.direction);
    return add(line.point, scale(line.direction, t));
}

/** translate(A, dx, dy) */
export function translate(point, dx, dy) {
    checkFinite(dx, dy);
    return new Point(point.x + dx, point.y + dy);
}

/** rotate(A, angle_degrees, O): counterclockwise positive (§22 #17) */
export function rotate(point, angleDegrees, center) {
    checkFinite(angleDegrees);
    const rad = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const v = sub(point, center);
    return new Point(
        center.x + v.x * cos - v.y * sin,
        center.y + v.x * sin + v.y * cos,
    );
}

/** reflect(A, l): mirror point across line l */
export function reflect(point, line) {
    const foot = projection(point, line);
    const v = sub(point, foot);
    return new Point(foot.x - v.x, foot.y - v.y);
}

// --- measurements (§23) ---------------------------------------------------------

/** angle(A, B, C) in degrees, 0 <= angle <= 180 */
export function angleAt(a, b, c, what = "angle") {
    const u = sub(a, b);
    const v = sub(c, b);
    const lu = lengthOf(u);
    const lv = lengthOf(v);
    if (lu < EPSILON || lv < EPSILON) {
        throw new GeometryErrorDSLError(`cannot measure ${what}: degenerate angle`);
    }
    const cos = (u.x * v.x + u.y * v.y) / (lu * lv);
    const clamped = Math.min(1, Math.max(-1, cos));
    return (Math.acos(clamped) * 180) / Math.PI;
}

/** shoelace area */
export function polygonArea(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const q = points[(i + 1) % points.length];
        sum += p.x * q.y - q.x * p.y;
    }
    return Math.abs(sum) / 2;
}

/** closed polygon perimeter */
export function polygonPerimeter(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        sum += distance(points[i], points[(i + 1) % points.length]);
    }
    return sum;
}

/** open polyline length */
export function polylineLength(points) {
    let sum = 0;
    for (let i = 1; i < points.length; i++) {
        sum += distance(points[i - 1], points[i]);
    }
    return sum;
}
