/**
 * Bounding boxes (spec §33).
 *
 * Line / Ray are infinite: they are excluded here and clipped to the
 * viewport at layout time (see viewport.js).
 */

import { EPSILON } from "../engine/epsilon.js";

export function geometryBounds(geometry) {
    switch (geometry.type) {
        case "Point":
            return { minX: geometry.x, minY: geometry.y, maxX: geometry.x, maxY: geometry.y };
        case "Segment":
            return boundsOfPoints([geometry.a, geometry.b]);
        case "Circle": {
            const r = geometry.radius;
            return {
                minX: geometry.center.x - r,
                minY: geometry.center.y - r,
                maxX: geometry.center.x + r,
                maxY: geometry.center.y + r,
            };
        }
        case "Arc":
            return arcBounds(geometry);
        case "Polygon":
        case "Polyline":
            return boundsOfPoints(geometry.points);
        case "Line":
        case "Ray":
            return null; // infinite: clipped to viewport
        default:
            return null;
    }
}

function boundsOfPoints(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Arc bounds: endpoints plus the cardinal extreme angles (0, PI/2, PI, 3PI/2)
 * that lie within the arc sweep.
 */
export function arcBounds(arc) {
    const points = [
        anglePoint(arc.center, arc.radius, arc.startAngle),
        anglePoint(arc.center, arc.radius, arc.endAngle),
    ];

    for (let k = 0; k < 4; k++) {
        const angle = (k * Math.PI) / 2;
        if (angleInSweep(angle, arc)) {
            points.push(anglePoint(arc.center, arc.radius, angle));
        }
    }
    return boundsOfPoints(points);
}

function anglePoint(center, radius, angle) {
    return {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
    };
}

/** is `angle` within the arc sweep (startAngle toward endAngle, ccw flag)? */
export function angleInSweep(angle, arc) {
    const TAU = 2 * Math.PI;
    const norm = (a) => {
        let x = a % TAU;
        if (x < 0) x += TAU;
        return x;
    };
    const start = norm(arc.startAngle);
    const delta = norm(angle - start);
    const sweep = Math.abs(arc.sweep);
    if (arc.ccw) {
        return delta <= sweep + EPSILON;
    }
    return TAU - delta <= sweep + EPSILON;
}
