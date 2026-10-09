/**
 * Geometry structures (spec §18).
 *
 * Engine coordinates are mathematical Cartesian (+Y up).
 * Only the renderer knows about SVG coordinates (spec §31).
 */

export class Point {
    constructor(x, y) {
        this.type = "Point";
        this.x = x;
        this.y = y;
    }
}

export class Vector {
    constructor(x, y) {
        this.type = "Vector";
        this.x = x;
        this.y = y;
    }
}

/** point + direction representation (never slope/intercept) */
export class Line {
    constructor(point, direction) {
        this.type = "Line";
        this.point = point;
        this.direction = direction;
    }
}

export class Segment {
    constructor(a, b) {
        this.type = "Segment";
        this.a = a;
        this.b = b;
    }
}

export class Ray {
    constructor(origin, direction) {
        this.type = "Ray";
        this.origin = origin;
        this.direction = direction;
    }
}

export class Circle {
    constructor(center, radius) {
        this.type = "Circle";
        this.center = center;
        this.radius = radius;
    }
}

/**
 * Arc: center + radius + angles in radians. Stored as a counterclockwise
 * minor arc: sweep is in (0, PI] (spec §28 minor-arc rule, D14).
 */
export class Arc {
    constructor(center, radius, startAngle, endAngle, ccw = true) {
        this.type = "Arc";
        this.center = center;
        this.radius = radius;
        this.startAngle = startAngle;
        this.endAngle = endAngle;
        this.ccw = ccw;
        this.sweep = ccw ? endAngle - startAngle : startAngle - endAngle;
    }
}

export class Polygon {
    constructor(points) {
        this.type = "Polygon";
        this.points = points;
    }
}

export class Polyline {
    constructor(points) {
        this.type = "Polyline";
        this.points = points;
    }
}
