/**
 * Intersection algorithms (spec §25, §26).
 *
 * Low-level routines return { points, reason }:
 *   points: array of 0..2 intersection points
 *   reason: "ok" | "parallel" | "disjoint"
 * Coincident/collinear overlap (infinitely many intersections) throws
 * GeometryError directly, per §25.
 */

import { Point } from "../ir/geometry.js";
import { EPSILON, near, comparePointsXY } from "./epsilon.js";
import { GeometryErrorDSLError } from "../errors.js";
import { add, sub, scale, dot, cross, lengthOf, normalize, perp } from "./primitives.js";

function coincidentError(whatA, whatB) {
    return new GeometryErrorDSLError(
        `cannot intersect ${whatA} and ${whatB}: objects coincide (infinitely many intersections)`,
    );
}

/**
 * line × line (also line × segment direction logic reused).
 * Directions must be unit vectors.
 */
export function lineLine(l1, l2, whatA = "line", whatB = "line") {
    const denom = cross(l1.direction, l2.direction);
    if (Math.abs(denom) < EPSILON) {
        // parallel: collinear?
        const w = sub(l2.point, l1.point);
        if (Math.abs(cross(w, l1.direction)) < EPSILON) {
            throw coincidentError(whatA, whatB);
        }
        return { points: [], reason: "parallel" };
    }
    const w = sub(l2.point, l1.point);
    const t = cross(w, l2.direction) / denom;
    return { points: [add(l1.point, scale(l1.direction, t))], reason: "ok" };
}

/** segment × segment */
export function segmentSegment(s1, s2, whatA = "segment", whatB = "segment") {
    const d1 = sub(s1.b, s1.a);
    const d2 = sub(s2.b, s2.a);
    const denom = cross(d1, d2);
    const w = sub(s2.a, s1.a);

    if (Math.abs(denom) >= EPSILON) {
        const t = cross(w, d2) / denom;
        const u = cross(w, d1) / denom;
        const tol = EPSILON / Math.max(1, lengthOf(d1) * lengthOf(d2));
        if (t >= -tol && t <= 1 + tol && u >= -tol && u <= 1 + tol) {
            return { points: [add(s1.a, scale(d1, t))], reason: "ok" };
        }
        return { points: [], reason: "disjoint" };
    }

    // parallel
    if (Math.abs(cross(w, d1)) >= EPSILON) {
        return { points: [], reason: "parallel" };
    }
    // collinear: project s2 endpoints onto s1's unit-direction line;
    // t values are absolute lengths, s1 spans [0, len1]
    const len1 = lengthOf(d1);
    const u1 = scale(d1, 1 / len1);
    const t0 = dot(w, u1);
    const t1 = t0 + dot(d2, u1);
    const lo = Math.min(t0, t1);
    const hi = Math.max(t0, t1);
    const start = Math.max(0, lo);
    const end = Math.min(len1, hi);
    if (end < start - EPSILON) {
        return { points: [], reason: "disjoint" };
    }
    if (end - start > EPSILON) {
        throw coincidentError(whatA, whatB); // overlapping -> infinitely many
    }
    const t = (start + end) / 2;
    return { points: [add(s1.a, scale(u1, t))], reason: "ok" };
}

/** segment × line */
export function segmentLine(s, l, whatA = "segment", whatB = "line") {
    const d = sub(s.b, s.a);
    const denom = cross(d, l.direction);
    const w = sub(l.point, s.a);

    if (Math.abs(denom) >= EPSILON) {
        const t = cross(w, l.direction) / denom;
        const tol = EPSILON / Math.max(1, lengthOf(d));
        if (t >= -tol && t <= 1 + tol) {
            return { points: [add(s.a, scale(d, t))], reason: "ok" };
        }
        return { points: [], reason: "disjoint" };
    }

    // parallel
    if (Math.abs(cross(w, d)) >= EPSILON) {
        return { points: [], reason: "parallel" };
    }
    throw coincidentError(whatA, whatB); // segment lies on the line
}

/** line × circle: 0 / 1 (tangent) / 2 intersections */
export function lineCircle(l, c, whatA = "line", whatB = "circle") {
    const w = sub(c.center, l.point);
    const footDist = dot(w, l.direction);
    const foot = add(l.point, scale(l.direction, footDist));
    const dist = lengthOf(sub(c.center, foot));

    if (dist > c.radius + EPSILON) {
        return { points: [], reason: "disjoint" };
    }
    if (near(dist, c.radius)) {
        return { points: [foot], reason: "ok" };
    }
    const half = Math.sqrt(c.radius * c.radius - dist * dist);
    const points = [
        add(foot, scale(l.direction, half)),
        add(foot, scale(l.direction, -half)),
    ];
    points.sort(comparePointsXY);
    return { points, reason: "ok" };
}

/** circle × circle: 0 / 1 (tangent) / 2 intersections */
export function circleCircle(c1, c2, whatA = "circle", whatB = "circle") {
    const w = sub(c2.center, c1.center);
    const d = lengthOf(w);
    const r1 = c1.radius;
    const r2 = c2.radius;

    if (d < EPSILON) {
        // concentric
        if (near(r1, r2)) {
            throw coincidentError(whatA, whatB);
        }
        return { points: [], reason: "disjoint" };
    }

    if (d > r1 + r2 + EPSILON) {
        return { points: [], reason: "disjoint" };
    }
    if (d < Math.abs(r1 - r2) - EPSILON) {
        return { points: [], reason: "disjoint" };
    }
    if (near(d, r1 + r2) || near(d, Math.abs(r1 - r2))) {
        // tangent: single point on the center line
        const unit = scale(w, 1 / d);
        const t = near(d, r1 + r2) ? r1 : r1 > r2 ? r1 : -r1;
        return { points: [add(c1.center, scale(unit, t / 1))], reason: "ok" };
    }

    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - a * a;
    const h = Math.sqrt(Math.max(0, h2));
    const unit = scale(w, 1 / d);
    const base = add(c1.center, scale(unit, a));
    const n = perp(unit);
    const points = [
        add(base, scale(n, h)),
        add(base, scale(n, -h)),
    ];
    points.sort(comparePointsXY);
    return { points, reason: "ok" };
}
