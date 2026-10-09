/**
 * Semantic type system (spec §16).
 */

export const Type = {
    POINT: "Point",
    LINE: "Line",
    SEGMENT: "Segment",
    RAY: "Ray",
    CIRCLE: "Circle",
    ARC: "Arc",
    POLYGON: "Polygon",
    POLYLINE: "Polyline",
    NUMBER: "Number",
    STRING: "String",
    COLOR: "Color",
};

export const GEOMETRY_TYPES = new Set([
    Type.POINT,
    Type.LINE,
    Type.SEGMENT,
    Type.RAY,
    Type.CIRCLE,
    Type.ARC,
    Type.POLYGON,
    Type.POLYLINE,
]);

export const KIND_NAMES = new Set([
    "point", "line", "segment", "ray", "circle", "arc", "polygon", "polyline",
]);

export function isGeometry(type) {
    return GEOMETRY_TYPES.has(type);
}

export function isPointType(type) {
    return type === Type.POINT;
}

/**
 * Human-readable type description for error messages.
 */
export function describeType(type) {
    return type ?? "unknown";
}

/**
 * Check whether a concrete type matches an argument specification.
 * Spec: string (exact), array (union), or {rest, min} variadic marker.
 */
export function matchesArgSpec(spec, type) {
    if (Array.isArray(spec)) {
        return spec.includes(type);
    }
    if (typeof spec === "string") {
        return spec === type;
    }
    return false;
}
