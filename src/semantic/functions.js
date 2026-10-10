/**
 * Function registry (spec §49).
 *
 * Adding a primitive means adding an entry here — no parser changes.
 * Each signature: { args, returns, build }.
 *   args item: type string | union array | {rest: [types], min: n} (must be last)
 *   build(astArgs, ctx) -> canonical definition node (spec §50 desugaring)
 *
 * ctx = {
 *   desugar(expr)          canonicalize a geometry expression to a definition node
 *   numeric(expr)          canonicalize a numeric expression (kept as AST)
 *   point(expr)            desugar + assert Point-typed expression
 *   checkIndex(expr)       validate intersect's literal index, return integer or null
 * }
 */

function num(expr, ctx) {
    return ctx.numeric(expr);
}

function pt(expr, ctx) {
    return ctx.point(expr);
}

function geo(expr, ctx) {
    return ctx.desugar(expr);
}

function refName(name, position) {
    return { type: "RefDefinition", name, position };
}

// segment ref "AB" -> pair of point refs (or a materialized object ref, decided by ctx)
export const functions = new Map();

function define(name, { aliases = [], signatures }) {
    functions.set(name, { name, aliases, signatures });
    for (const alias of aliases) {
        functions.set(alias, { name: alias, aliases, signatures, aliasOf: name });
    }
}

// --- 1-8 basic geometry -------------------------------------------------------

define("point", {
    signatures: [{
        args: ["Number", "Number"],
        returns: "Point",
        build: (a, ctx) => ({
            type: "PointLiteralDefinition",
            x: num(a[0], ctx),
            y: num(a[1], ctx),
            position: a[0].position,
        }),
    }],
});

define("line", {
    signatures: [
        {
            args: ["Point", "Point"],
            returns: "Line",
            build: (a, ctx) => ({ type: "LineDefinition", a: pt(a[0], ctx), b: pt(a[1], ctx), position: a[0].position }),
        },
        {
            args: ["Segment"],
            returns: "Line",
            build: (a, ctx) => segmentToEndpoints(geo(a[0], ctx), a[0].position, "LineDefinition"),
        },
    ],
});

define("segment", {
    signatures: [{
        args: ["Point", "Point"],
        returns: "Segment",
        build: (a, ctx) => ({ type: "SegmentDefinition", a: pt(a[0], ctx), b: pt(a[1], ctx), position: a[0].position }),
    }],
});

define("ray", {
    signatures: [{
        args: ["Point", "Point"],
        returns: "Ray",
        build: (a, ctx) => ({ type: "RayDefinition", a: pt(a[0], ctx), b: pt(a[1], ctx), position: a[0].position }),
    }],
});

define("circle", {
    signatures: [
        {
            args: ["Point", "Number"],
            returns: "Circle",
            build: (a, ctx) => ({ type: "CircleCenterRadiusDefinition", center: pt(a[0], ctx), radius: num(a[1], ctx), position: a[0].position }),
        },
        {
            args: ["Point", "Point"],
            returns: "Circle",
            build: (a, ctx) => ({ type: "CircleThroughPointDefinition", center: pt(a[0], ctx), through: pt(a[1], ctx), position: a[0].position }),
        },
    ],
});

define("arc", {
    signatures: [{
        args: ["Point", "Point", "Point"],
        returns: "Arc",
        build: (a, ctx) => ({ type: "ArcDefinition", center: pt(a[0], ctx), a: pt(a[1], ctx), b: pt(a[2], ctx), position: a[0].position }),
    }],
});

define("polygon", {
    signatures: [{
        args: [{ rest: ["Point"], min: 3 }],
        returns: "Polygon",
        build: (a, ctx) => ({ type: "PolygonDefinition", points: a.map((e) => pt(e, ctx)), position: a[0].position }),
    }],
});

define("polyline", {
    signatures: [{
        args: [{ rest: ["Point"], min: 2 }],
        returns: "Polyline",
        build: (a, ctx) => ({ type: "PolylineDefinition", points: a.map((e) => pt(e, ctx)), position: a[0].position }),
    }],
});

// --- 9-18 constructions --------------------------------------------------------

define("mid", {
    aliases: ["midpoint"],
    signatures: [
        {
            args: ["Segment"],
            returns: "Point",
            build: (a, ctx) => {
                const seg = geo(a[0], ctx);
                if (seg.type === "RefDefinition") {
                    // materialized segment object: engine unwraps endpoints at
                    // eval time (mirrors LineDefinition fromSegmentRef, plan fix)
                    return { type: "MidpointDefinition", a: seg, b: null, fromSegmentRef: true, position: a[0].position };
                }
                return { type: "MidpointDefinition", a: seg.a, b: seg.b, position: a[0].position };
            },
        },
        {
            args: ["Point", "Point"],
            returns: "Point",
            build: (a, ctx) => ({ type: "MidpointDefinition", a: pt(a[0], ctx), b: pt(a[1], ctx), position: a[0].position }),
        },
    ],
});

// intersect is checked/built specially (matrix + literal index); registered for typing.
define("intersect", {
    signatures: [{
        args: ["Geometry", "Geometry", { rest: ["Number"], min: 0 }],
        returns: "Point",
        build: (a, ctx) => ({
            type: "IntersectionDefinition",
            first: geo(a[0], ctx),
            second: geo(a[1], ctx),
            index: a.length > 2 ? ctx.checkIndex(a[2]) : null,
            position: a[0].position,
        }),
    }],
});

define("perpendicular", {
    signatures: [{
        args: ["Point", ["Line", "Segment"]],
        returns: "Line",
        build: (a, ctx) => ({
            type: "PerpendicularDefinition",
            point: pt(a[0], ctx),
            line: lineLike(a[1], ctx),
            position: a[0].position,
        }),
    }],
});

define("parallel", {
    signatures: [{
        args: ["Point", ["Line", "Segment"]],
        returns: "Line",
        build: (a, ctx) => ({
            type: "ParallelDefinition",
            point: pt(a[0], ctx),
            line: lineLike(a[1], ctx),
            position: a[0].position,
        }),
    }],
});

define("perpendicular_bisector", {
    signatures: [
        {
            args: ["Segment"],
            returns: "Line",
            build: (a, ctx) => {
                const seg = geo(a[0], ctx);
                if (seg.type === "RefDefinition") {
                    return { type: "PerpendicularBisectorDefinition", a: seg, b: null, fromSegmentRef: true, position: a[0].position };
                }
                return { type: "PerpendicularBisectorDefinition", a: seg.a, b: seg.b, position: a[0].position };
            },
        },
        {
            args: ["Point", "Point"],
            returns: "Line",
            build: (a, ctx) => ({ type: "PerpendicularBisectorDefinition", a: pt(a[0], ctx), b: pt(a[1], ctx), position: a[0].position }),
        },
    ],
});

define("angle_bisector", {
    signatures: [{
        args: ["Point", "Point", "Point"],
        returns: "Line",
        build: (a, ctx) => ({ type: "AngleBisectorDefinition", a: pt(a[0], ctx), b: pt(a[1], ctx), c: pt(a[2], ctx), position: a[0].position }),
    }],
});

define("projection", {
    signatures: [{
        args: ["Point", ["Line", "Segment"]],
        returns: "Point",
        build: (a, ctx) => ({
            type: "ProjectionDefinition",
            point: pt(a[0], ctx),
            line: lineLike(a[1], ctx),
            position: a[0].position,
        }),
    }],
});

define("translate", {
    signatures: [{
        args: ["Point", "Number", "Number"],
        returns: "Point",
        build: (a, ctx) => ({ type: "TranslationDefinition", point: pt(a[0], ctx), dx: num(a[1], ctx), dy: num(a[2], ctx), position: a[0].position }),
    }],
});

define("rotate", {
    signatures: [{
        args: ["Point", "Number", "Point"],
        returns: "Point",
        build: (a, ctx) => ({ type: "RotationDefinition", point: pt(a[0], ctx), angle: num(a[1], ctx), center: pt(a[2], ctx), position: a[0].position }),
    }],
});

define("reflect", {
    signatures: [{
        args: ["Point", ["Line", "Segment"]],
        returns: "Point",
        build: (a, ctx) => ({
            type: "ReflectionDefinition",
            point: pt(a[0], ctx),
            line: lineLike(a[1], ctx),
            position: a[0].position,
        }),
    }],
});

// --- 19-23 measurements ---------------------------------------------------------

define("distance", {
    signatures: [{
        args: ["Point", "Point"],
        returns: "Number",
        build: (a, ctx) => ({ type: "DistanceCall", a: pt(a[0], ctx), b: pt(a[1], ctx), position: a[0].position }),
    }],
});

define("length", {
    signatures: [{
        args: [["Segment", "Arc", "Polyline", "Polygon"]],
        returns: "Number",
        build: (a, ctx) => ({ type: "LengthCall", target: geo(a[0], ctx), position: a[0].position }),
    }],
});

define("angle", {
    signatures: [{
        args: ["Point", "Point", "Point"],
        returns: "Number",
        build: (a, ctx) => ({ type: "AngleCall", a: pt(a[0], ctx), b: pt(a[1], ctx), c: pt(a[2], ctx), position: a[0].position }),
    }],
});

define("area", {
    signatures: [{
        args: [["Polygon"]],
        returns: "Number",
        build: (a, ctx) => ({ type: "AreaCall", target: geo(a[0], ctx), position: a[0].position }),
    }],
});

define("perimeter", {
    signatures: [{
        args: [["Polygon"]],
        returns: "Number",
        build: (a, ctx) => ({ type: "PerimeterCall", target: geo(a[0], ctx), position: a[0].position }),
    }],
});

// --- 24-28 triangle functions -----------------------------------------------------

for (const [name, defType, returns] of [
    ["centroid", "CentroidDefinition", "Point"],
    ["circumcenter", "CircumcenterDefinition", "Point"],
    ["circumcircle", "CircumcircleDefinition", "Circle"],
    ["incenter", "IncenterDefinition", "Point"],
    ["incircle", "IncircleDefinition", "Circle"],
]) {
    define(name, {
        signatures: [
            {
                args: ["Polygon"],
                returns,
                build: (a, ctx) => triangleDef(defType, geo(a[0], ctx), a[0].position),
            },
            {
                args: ["Point", "Point", "Point"],
                returns,
                build: (a, ctx) => ({
                    type: defType,
                    a: pt(a[0], ctx),
                    b: pt(a[1], ctx),
                    c: pt(a[2], ctx),
                    position: a[0].position,
                }),
            },
        ],
    });
}

// --- helpers ------------------------------------------------------------------------

/**
 * Lookup a function entry by name or alias. Returns the canonical entry
 * (with the primary name), or null if unknown.
 */
export function lookupFunction(name) {
    const entry = functions.get(name);
    if (!entry) return null;
    return entry.aliasOf ? functions.get(entry.aliasOf) : entry;
}

/** SegmentRef / segment() args may materialize into a named object ref. */
function segmentToEndpoints(def, position, defType) {
    if (def.type === "RefDefinition") {
        // reference to a materialized segment object; engine resolves endpoints
        return { type: defType, a: def, b: null, fromSegmentRef: true, position };
    }
    if (def.type === "SegmentDefinition") {
        return { type: defType, a: def.a, b: def.b, position };
    }
    // inline segment built from other constructions: engine resolves via its geometry
    return { type: defType, a: def, b: null, fromSegmentRef: true, position };
}

/** line-like argument (Line or Segment) -> definition the engine can make a Line from */
function lineLike(expr, ctx) {
    const def = ctx.desugar(expr);
    if (def.type === "RefDefinition") return def;
    if (def.type === "SegmentDefinition") {
        return { type: "LineDefinition", a: def.a, b: def.b, position: def.position };
    }
    return def;
}

/** triangle function over a polygon arg: require exactly 3 vertices, keep as points */
function triangleDef(defType, def, position) {
    return { type: defType, polygon: def, position };
}
