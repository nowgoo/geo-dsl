/**
 * Geometry evaluation (spec §29, §47): walk the dependency graph in
 * topological order and evaluate every object's canonical definition.
 * Also resolves labels and marks to concrete geometry data.
 */

import { Point } from "../ir/geometry.js";
import { EPSILON, isFiniteNumber, comparePointsXY } from "./epsilon.js";
import {
    GeometryErrorDSLError,
    ArgumentErrorDSLError,
    TypeErrorDSLError,
} from "../errors.js";
import { buildDependencyGraph, detectCycles, topologicalOrder } from "./dependency.js";
import {
    makeSegment, makeLine, makeRay, makeCircle, makeArc, makePolygon, makePolyline,
    midpoint, perpendicularThrough, parallelThrough, perpendicularBisector,
    angleBisector, projection, translate, rotate, reflect,
    distance, angleAt, polygonArea, polygonPerimeter, polylineLength,
} from "./primitives.js";
import {
    centroid as centroidOf, circumcenter as circumcenterOf,
    circumcircle as circumcircleOf, incenter as incenterOf, incircle as incircleOf,
} from "./triangle.js";
import {
    lineLine, segmentSegment, segmentLine, lineCircle, circleCircle,
} from "./intersection.js";

export function evaluate(document, options = {}) {
    const edges = buildDependencyGraph(document.objects);
    detectCycles(edges);
    const order = topologicalOrder(document.objects, edges);
    // v0.2 solver hook: evaluate a subset only (fixed subgraph first, dependent
    // subgraph per LM iteration); labels/marks resolve on full passes only.
    const only = options.only ?? null;

    for (const name of order) {
        if (only && !only.has(name)) continue;
        const object = document.objects.get(name);
        try {
            object.geometry = evalDefinition(object.definition, document, name);
        } catch (error) {
            attachPosition(error, object.position);
            throw error;
        }
    }

    if (!only) {
        resolveLabels(document);
        resolveMarks(document);
    }
    return document;
}

function attachPosition(error, position) {
    if (error && error.line == null && position) {
        error.line = position.line;
        error.column = position.column;
        error.offset = position.offset;
    }
    return error;
}

// --- geometry definition evaluation --------------------------------------------

export function evalDefinition(def, document, objectName = "?") {
    switch (def.type) {
        case "RefDefinition":
            return refGeometry(def, document);
        case "PointLiteralDefinition":
            return new Point(evalNumber(def.x, document), evalNumber(def.y, document));
        case "SegmentDefinition":
            return makeSegment(
                evalPoint(def.a, document), evalPoint(def.b, document),
                `segment ${objectName}`,
            );
        case "LineDefinition":
            return evalLineFromPoints(def, document, objectName);
        case "RayDefinition":
            return makeRay(
                evalPoint(def.a, document), evalPoint(def.b, document),
                `ray ${objectName}`,
            );
        case "CircleCenterRadiusDefinition": {
            const r = evalNumber(def.radius, document);
            return makeCircle(evalPoint(def.center, document), r, `circle ${objectName}`);
        }
        case "CircleThroughPointDefinition": {
            const center = evalPoint(def.center, document);
            const through = evalPoint(def.through, document);
            return makeCircle(center, distance(center, through), `circle ${objectName}`);
        }
        case "ArcDefinition":
            return makeArc(
                evalPoint(def.center, document),
                evalPoint(def.a, document),
                evalPoint(def.b, document),
                `arc ${objectName}`,
            );
        case "PolygonDefinition":
            return makePolygon(def.points.map((p) => evalPoint(p, document)), `polygon ${objectName}`);
        case "PolylineDefinition":
            return makePolyline(def.points.map((p) => evalPoint(p, document)), `polyline ${objectName}`);
        case "UnknownPointDefinition":
            // v0.2 (spec_v0.2 §5): coordinates are provided by the solver; during the
            // fixed-subgraph pass the object is skipped and never reaches here.
            {
                const object = document.objects.get(objectName);
                if (object && object.geometry) {
                    return object.geometry;
                }
                throw new GeometryErrorDSLError(
                    `unknown point "${objectName}" has no solved coordinates yet`,
                );
            }
        case "MidpointDefinition":
            if (def.fromSegmentRef) {
                const seg = refGeometry(def.a, document);
                return midpoint(seg.a, seg.b);
            }
            return midpoint(evalPoint(def.a, document), evalPoint(def.b, document));
        case "IntersectionDefinition":
            return evalIntersection(def, document);
        case "PerpendicularDefinition":
            return perpendicularThrough(evalPoint(def.point, document), evalLineLike(def.line, document));
        case "ParallelDefinition":
            return parallelThrough(evalPoint(def.point, document), evalLineLike(def.line, document));
        case "PerpendicularBisectorDefinition":
            if (def.fromSegmentRef) {
                const seg = refGeometry(def.a, document);
                return perpendicularBisector(seg.a, seg.b);
            }
            return perpendicularBisector(evalPoint(def.a, document), evalPoint(def.b, document));
        case "AngleBisectorDefinition":
            return angleBisector(
                evalPoint(def.a, document), evalPoint(def.b, document), evalPoint(def.c, document),
            );
        case "ProjectionDefinition":
            return projection(evalPoint(def.point, document), evalLineLike(def.line, document));
        case "TranslationDefinition":
            return translate(evalPoint(def.point, document), evalNumber(def.dx, document), evalNumber(def.dy, document));
        case "RotationDefinition":
            return rotate(evalPoint(def.point, document), evalNumber(def.angle, document), evalPoint(def.center, document));
        case "ReflectionDefinition":
            return reflect(evalPoint(def.point, document), evalLineLike(def.line, document));
        case "CentroidDefinition":
            return evalCentroid(def, document);
        case "CircumcenterDefinition":
            return evalTriangleFn(def, document, circumcenterOf);
        case "CircumcircleDefinition":
            return evalTriangleFn(def, document, circumcircleOf);
        case "IncenterDefinition":
            return evalTriangleFn(def, document, incenterOf);
        case "IncircleDefinition":
            return evalTriangleFn(def, document, incircleOf);
        default:
            throw new GeometryErrorDSLError(`unknown definition type "${def.type}"`);
    }
}

function refGeometry(def, document) {
    const object = document.objects.get(def.name);
    if (!object) {
        throw new GeometryErrorDSLError(`undefined reference "${def.name}"`);
    }
    if (object.geometry == null) {
        throw new GeometryErrorDSLError(
            `reference "${def.name}" is not evaluated yet (dependency ordering bug)`,
        );
    }
    return object.geometry;
}

function evalLineFromPoints(def, document, objectName) {
    if (def.fromSegmentRef || def.b == null) {
        // line(AB) where AB is a materialized segment object or an inline segment
        const seg = evalDefinition(def.a, document, objectName);
        if (seg.type === "Line") return seg;
        if (seg.type !== "Segment") {
            throw new TypeErrorDSLError(`cannot construct line from ${seg.type}`);
        }
        return makeLine(seg.a, seg.b, `line ${objectName}`);
    }
    return makeLine(evalPoint(def.a, document), evalPoint(def.b, document), `line ${objectName}`);
}

function evalLineLike(def, document) {
    // Line or Segment argument used where a Line is needed
    const geometry = evalDefinition(def, document);
    if (geometry.type === "Line") return geometry;
    if (geometry.type === "Segment") {
        return makeLine(geometry.a, geometry.b, "line");
    }
    throw new TypeErrorDSLError(`expected a Line or Segment, got ${geometry.type}`);
}

function evalPoint(def, document) {
    const geometry = evalDefinition(def, document);
    if (geometry.type !== "Point") {
        throw new TypeErrorDSLError(`expected a Point value, got ${geometry.type}`);
    }
    return geometry;
}

function evalCentroid(def, document) {
    let points;
    if (def.polygon) {
        const poly = evalDefinition(def.polygon, document);
        points = poly.points;
    } else {
        points = [evalPoint(def.a, document), evalPoint(def.b, document), evalPoint(def.c, document)];
    }
    if (!points.length) {
        throw new GeometryErrorDSLError("cannot construct centroid: no points");
    }
    let sx = 0;
    let sy = 0;
    for (const p of points) {
        sx += p.x;
        sy += p.y;
    }
    return new Point(sx / points.length, sy / points.length);
}

function evalTriangleFn(def, document, fn) {
    let a, b, c;
    if (def.polygon) {
        const poly = evalDefinition(def.polygon, document);
        if (poly.points.length !== 3) {
            throw new GeometryErrorDSLError(
                `triangle function requires exactly 3 points, got ${poly.points.length}`,
            );
        }
        [a, b, c] = poly.points;
    } else {
        a = evalPoint(def.a, document);
        b = evalPoint(def.b, document);
        c = evalPoint(def.c, document);
    }
    return fn(a, b, c);
}

// --- intersection dispatch (§25, §26) -------------------------------------------

function evalIntersection(def, document) {
    const first = evalDefinition(def.first, document);
    const second = evalDefinition(def.second, document);
    const whatA = describeGeometry(first, def.first);
    const whatB = describeGeometry(second, def.second);

    let result;
    if (first.type === "Line" && second.type === "Line") {
        result = lineLine(first, second, whatA, whatB);
    } else if (first.type === "Segment" && second.type === "Segment") {
        result = segmentSegment(first, second, whatA, whatB);
    } else if (first.type === "Segment" && second.type === "Line") {
        result = segmentLine(first, second, whatA, whatB);
    } else if (first.type === "Line" && second.type === "Segment") {
        result = segmentLine(second, first, whatB, whatA);
    } else if (first.type === "Line" && second.type === "Circle") {
        result = lineCircle(first, second, whatA, whatB);
    } else if (first.type === "Circle" && second.type === "Line") {
        result = lineCircle(second, first, whatB, whatA);
    } else if (first.type === "Circle" && second.type === "Circle") {
        result = circleCircle(first, second, whatA, whatB);
    } else {
        throw new ArgumentErrorDSLError(
            `unsupported intersection: ${first.type} × ${second.type}`,
        );
    }

    if (result.points.length === 0) {
        throw new GeometryErrorDSLError(emptyMessage(first, second, whatA, whatB, result.reason));
    }

    const count = result.points.length;
    let index = def.index;
    if (count > 1 && index == null) {
        throw new ArgumentErrorDSLError(
            `intersection of ${whatA} and ${whatB} has ${count} intersection points; provide an index like intersect(a, b, 1)`,
        );
    }
    if (index != null) {
        if (index > count) {
            throw new GeometryErrorDSLError(
                `intersection index ${index} out of range: ${whatA} and ${whatB} have ${count} intersection point${count === 1 ? "" : "s"}`,
            );
        }
        return result.points[index - 1];
    }
    return result.points[0];
}

function emptyMessage(first, second, whatA, whatB, reason) {
    if (reason === "parallel") {
        return `cannot intersect ${whatA} and ${whatB}: objects are parallel`;
    }
    return `cannot intersect ${whatA} and ${whatB}: no intersection`;
}

function describeGeometry(geometry, def) {
    if (def.type === "RefDefinition") {
        return def.name;
    }
    return geometry.type.toLowerCase();
}

// --- numeric expression evaluation -------------------------------------------------

export function evalNumber(node, document) {
    switch (node.type) {
        case "NumberExpr":
            return node.value;
        case "UnaryExpr":
            return -evalNumber(node.operand, document);
        case "BinaryExpr": {
            const l = evalNumber(node.left, document);
            const r = evalNumber(node.right, document);
            let value;
            switch (node.operator) {
                case "+": value = l + r; break;
                case "-": value = l - r; break;
                case "*": value = l * r; break;
                case "/":
                    if (Math.abs(r) < EPSILON) {
                        throw new GeometryErrorDSLError("division by zero");
                    }
                    value = l / r;
                    break;
                case "^": value = l ** r; break;
                default:
                    throw new GeometryErrorDSLError(`unknown numeric operator "${node.operator}"`);
            }
            if (!isFiniteNumber(value)) {
                throw new GeometryErrorDSLError("non-finite value in numeric expression");
            }
            return value;
        }
        case "DistanceCall":
            return distance(evalPoint(node.a, document), evalPoint(node.b, document));
        case "LengthCall":
            return evalLength(evalDefinition(node.target, document));
        case "AngleCall":
            return angleAt(
                evalPoint(node.a, document), evalPoint(node.b, document), evalPoint(node.c, document),
            );
        case "AreaCall": {
            const poly = evalDefinition(node.target, document);
            return polygonArea(poly.points);
        }
        case "PerimeterCall": {
            const poly = evalDefinition(node.target, document);
            return polygonPerimeter(poly.points);
        }
        case "RefDefinition": {
            const g = refGeometry(node, document);
            if (g.type === "Point") {
                throw new TypeErrorDSLError("a Point is not a number");
            }
            throw new TypeErrorDSLError(`a ${g.type} is not a number`);
        }
        default:
            throw new GeometryErrorDSLError(`unknown numeric expression ${node.type}`);
    }
}

function evalLength(geometry) {
    switch (geometry.type) {
        case "Segment":
            return distance(geometry.a, geometry.b);
        case "Arc":
            return geometry.radius * geometry.sweep;
        case "Polyline":
            return polylineLength(geometry.points);
        case "Polygon":
            return polygonPerimeter(geometry.points);
        case "Line":
        case "Ray":
            throw new GeometryErrorDSLError(`length is not defined for ${geometry.type}`);
        default:
            throw new GeometryErrorDSLError(`length is not defined for ${geometry.type}`);
    }
}

// --- labels / marks -----------------------------------------------------------------

function resolveLabels(document) {
    for (const label of document.labels) {
        const object = document.objects.get(label.target.name);
        if (!object || object.geometry == null) {
            throw new GeometryErrorDSLError(`label target "${label.target.name}" is not a point`);
        }
        if (object.geometry.type !== "Point") {
            throw new TypeErrorDSLError(`label target must be a Point, "${label.target.name}" is a ${object.geometry.type}`);
        }
        label.resolved = {
            x: object.geometry.x,
            y: object.geometry.y,
            text: label.text,
            offset: label.offset,
        };
    }
}

function resolveMarks(document) {
    for (const mark of document.marks) {
        try {
            switch (mark.kind) {
                case "right_angle": {
                    const [a, b, c] = mark.args.map((d) => evalPoint(d, document));
                    mark.resolved = { vertex: b, arm1: a, arm2: c };
                    break;
                }
                case "equal_length":
                case "parallel": {
                    mark.resolved = mark.args.map((d) => evalDefinition(d, document));
                    break;
                }
                case "equal_angle": {
                    const pts = mark.args.map((d) => evalPoint(d, document));
                    mark.resolved = {
                        first: [pts[0], pts[1], pts[2]],
                        second: [pts[3], pts[4], pts[5]],
                    };
                    break;
                }
                default:
                    throw new ArgumentErrorDSLError(`unknown mark kind "${mark.kind}"`);
            }
        } catch (error) {
            attachPosition(error, mark.position);
            throw error;
        }
    }
}
