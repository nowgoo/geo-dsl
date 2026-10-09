/**
 * SVG renderer (spec §40, §43).
 *
 * Accepts a fully compiled Document (IR evaluated + laid out).
 * Renderer never reads AST, parses DSL, computes geometry, or handles
 * dependencies (§2.3, §76).
 *
 * Output is a standalone, deterministic SVG string.
 */

import { buildStyleIndex, styleFor, markStyle, labelStyle } from "./style.js";
import {
    setTransform, renderLine, renderRay, renderSegment, renderPolyline,
    renderCircle, renderArc, renderPolygonFill, renderPolygonOutline, renderPoint,
} from "./geometry.js";
import { renderLabel } from "./labels.js";
import { renderMark, setMarkStyle } from "./marks.js";

export function renderSVG(document) {
    if (!document.transform) {
        throw new Error("document has no layout; call layout() before renderSVG()");
    }
    setTransform(document.transform);
    setMarkStyle(markStyle());

    const index = buildStyleIndex(document);
    const objects = [...document.objects.values()];

    const parts = [];
    parts.push(svgRoot(document));

    // Rendering order (spec §39):
    // 1. polygon fills
    // 2. circles / arcs
    // 3. lines
    // 4. segments
    // 5. rays
    // 6. polygon outlines
    // 7. points
    // 8. marks
    // 9. labels
    // (polyline renders with the stroke phase, after segments)

    for (const object of objects) {
        if (object.geometry?.type === "Polygon") {
            parts.push(renderPolygonFill(object, styleFor(document, "polygon", object.name, index)));
        }
    }
    for (const object of objects) {
        const g = object.geometry;
        if (g?.type === "Circle") {
            parts.push(renderCircle(object, styleFor(document, "circle", object.name, index)));
        } else if (g?.type === "Arc") {
            parts.push(renderArc(object, styleFor(document, "arc", object.name, index)));
        }
    }
    for (const object of objects) {
        if (object.geometry?.type === "Line") {
            parts.push(renderLine(object, styleFor(document, "line", object.name, index)));
        }
    }
    for (const object of objects) {
        const g = object.geometry;
        if (g?.type === "Segment") {
            parts.push(renderSegment(object, styleFor(document, "segment", object.name, index)));
        } else if (g?.type === "Polyline") {
            parts.push(renderPolyline(object, styleFor(document, "polyline", object.name, index)));
        }
    }
    for (const object of objects) {
        if (object.geometry?.type === "Ray") {
            parts.push(renderRay(object, styleFor(document, "ray", object.name, index)));
        }
    }
    for (const object of objects) {
        if (object.geometry?.type === "Polygon") {
            parts.push(renderPolygonOutline(object, styleFor(document, "polygon", object.name, index)));
        }
    }
    for (const object of objects) {
        if (object.geometry?.type === "Point") {
            parts.push(renderPoint(object, styleFor(document, "point", object.name, index)));
        }
    }

    // marks
    const mStyle = markStyle();
    for (const mark of document.marks) {
        parts.push(renderMark(document.transform, mark, mStyle));
    }

    // labels
    const lStyle = labelStyle();
    for (const label of document.labels) {
        parts.push(renderLabel(document.transform, label, lStyle));
    }

    parts.push("</svg>");
    return parts.join("\n");
}

function svgRoot(document) {
    const { width, height } = document.canvas;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
        `viewBox="0 0 ${width} ${height}">`
    );
}
