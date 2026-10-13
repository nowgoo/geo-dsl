/**
 * SVG renderer (spec §40, §43; spec_v0.3 §3).
 *
 * Accepts a fully compiled Document (IR evaluated + laid out).
 * Renderer never reads AST, parses DSL, computes geometry, or handles
 * dependencies (§2.3, §76).
 *
 * Output is a standalone, deterministic SVG string. Interactive mode
 * (opt-in via `renderSVG(document, { interactive: { runtimeUrl } })`) adds
 * annotation wrappers, a payload script and a bootstrap script; the default
 * single-argument output is byte-identical to previous versions.
 */

import { buildStyleIndex, styleFor, markStyle, labelStyle } from "./style.js";
import {
    setTransform, renderLine, renderRay, renderSegment, renderPolyline,
    renderCircle, renderArc, renderPolygonFill, renderPolygonOutline, renderPoint,
} from "./geometry.js";
import { renderLabel } from "./labels.js";
import { renderMark, setMarkStyle } from "./marks.js";
import { escapeXML } from "./format.js";
import { serializeDocument } from "../../ir/serialize.js";
import { titleFor } from "./titles.js";

/** default runtime URL, deployed next to the generated figure (spec_v0.3 §3) */
export const DEFAULT_RUNTIME_URL = "./geometry-dsl-runtime.js";

/** global name the bundled runtime exposes (scripts/bundle-runtime.mjs) */
const GLOBAL_NAME = "GeometryDSLInteractive";

export function renderSVG(document, options = {}) {
    const interactive = normalizeInteractive(options.interactive);
    return svgRoot(document, interactive) + "\n" + renderInnerSVG(document, { interactive }) + "\n</svg>";
}
/** everything between <svg…> and </svg> (scene group + interactive extras) */
export function renderInnerSVG(document, options = {}) {
    const interactive = normalizeInteractive(options.interactive);
    const parts = [renderScene(document, interactive)];
    if (interactive) {
        parts.push(styleBlock());
        parts.push(payloadBlock(document));
        if (interactive.runtimeSource !== undefined) {
            // self-contained mode: embed the runtime (plain script exposing
            // window.GeometryDSLInteractive) before the bootstrap (spec_v0.3 §3).
            // `</script` inside the source (our own templates contain it) would
            // terminate the host script tag early — escape it; `<\/script` is
            // the same string once parsed as JS.
            const source = interactive.runtimeSource.replace(/<\/script/gi, "<\\/script");
            parts.push(`<script>${source}</script>`);
            parts.push(globalBootstrapBlock());
        } else {
            parts.push(bootstrapBlock(interactive.runtimeUrl));
        }
    }
    return parts.join("\n");
}

/** the <g class="geo-scene">…</g> group the runtime replaces on re-render */
export function renderScene(document, interactive = null) {
    const children = renderSceneChildren(document, interactive);
    // scene group only in interactive mode: the runtime replaces its content
    // on re-render; default output stays byte-identical to static versions
    return interactive ? `<g class="geo-scene">\n${children}\n</g>` : children;
}

/** all object/marks/labels elements, without the scene group wrapper */
export function renderSceneChildren(document, interactive = null) {
    if (!document.transform) {
        throw new Error("document has no layout; call layout() before renderSVG()");
    }
    setTransform(document.transform);
    setMarkStyle(markStyle());

    const index = buildStyleIndex(document);
    const objects = [...document.objects.values()].filter((o) => !o.hidden);
    const wrap = interactive ? objectWrapper() : null;

    const parts = [];

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
            parts.push(wrapObject(wrap, object, renderPolygonFill(object, styleFor(document, "polygon", object.name, index))));
        }
    }
    for (const object of objects) {
        const g = object.geometry;
        if (g?.type === "Circle") {
            parts.push(wrapObject(wrap, object, renderCircle(object, styleFor(document, "circle", object.name, index))));
        } else if (g?.type === "Arc") {
            parts.push(wrapObject(wrap, object, renderArc(object, styleFor(document, "arc", object.name, index))));
        }
    }
    for (const object of objects) {
        if (object.geometry?.type === "Line") {
            parts.push(wrapObject(wrap, object, renderLine(object, styleFor(document, "line", object.name, index))));
        }
    }
    for (const object of objects) {
        const g = object.geometry;
        if (g?.type === "Segment") {
            parts.push(wrapObject(wrap, object, renderSegment(object, styleFor(document, "segment", object.name, index))));
        } else if (g?.type === "Polyline") {
            parts.push(wrapObject(wrap, object, renderPolyline(object, styleFor(document, "polyline", object.name, index))));
        }
    }
    for (const object of objects) {
        if (object.geometry?.type === "Ray") {
            parts.push(wrapObject(wrap, object, renderRay(object, styleFor(document, "ray", object.name, index))));
        }
    }
    for (const object of objects) {
        if (object.geometry?.type === "Polygon") {
            parts.push(wrapObject(wrap, object, renderPolygonOutline(object, styleFor(document, "polygon", object.name, index))));
        }
    }
    for (const object of objects) {
        if (object.geometry?.type === "Point") {
            parts.push(wrapObject(wrap, object, renderPoint(object, styleFor(document, "point", object.name, index))));
        }
    }

    // marks (not interactive targets in v0.3, spec_v0.3 §9)
    const mStyle = markStyle();
    for (const mark of document.marks) {
        parts.push(renderMark(document.transform, mark, mStyle));
    }

    // labels
    const lStyle = labelStyle();
    for (const label of document.labels) {
        // labels of hidden points are suppressed (§ hide)
        if (document.objects.get(label.target.name)?.hidden) continue;
        const text = renderLabel(document.transform, label, lStyle);
        parts.push(
            interactive
                ? `<g data-geo-label="${escapeXML(label.target.name)}">${text}</g>`
                : text,
        );
    }

    return parts.join("\n");
}

function normalizeInteractive(value) {
    if (!value) return null;
    return {
        runtimeUrl: value.runtimeUrl ?? DEFAULT_RUNTIME_URL,
        runtimeSource: value.runtimeSource,
    };
}

/** closure returning a wrapper that annotates one object's elements */
function objectWrapper() {
    return (object, inner) => {
        const title = escapeXML(titleFor(object));
        return (
            `<g class="geo-obj" data-geo-name="${escapeXML(object.name)}" data-geo-kind="${escapeXML(object.kind)}">` +
            `<title>${title}</title>${inner}</g>`
        );
    };
}

function wrapObject(wrap, object, element) {
    return wrap ? wrap(object, element) : element;
}

function svgRoot(document, interactive) {
    const { width, height } = document.canvas;
    const cls = interactive ? ` class="geo-interactive"` : "";
    return (
        `<svg xmlns="http://www.w3.org/2000/svg"${cls} width="${width}" height="${height}" ` +
        `viewBox="0 0 ${width} ${height}">`
    );
}

/** interaction CSS (spec_v0.3 §5.3) — static text, deterministic */
function styleBlock() {
    return [
        "<style>",
        ".geo-interactive{touch-action:none;user-select:none}",
        ".geo-obj{cursor:pointer}",
        '.geo-obj[data-geo-kind="Point"]{cursor:grab}',
        '.geo-interactive.is-dragging .geo-obj[data-geo-kind="Point"]{cursor:grabbing}',
        ".geo-obj:hover{filter:drop-shadow(0 0 3px #4a90d9)}",
        ".geo-obj.is-selected{filter:drop-shadow(0 0 4px #4a90d9)}",
        "g[data-geo-label]{cursor:move}",
        ".geo-interactive.is-error .geo-scene{filter:drop-shadow(0 0 4px #d94a4a)}",
        "</style>",
    ].join("\n");
}

function payloadBlock(document) {
    return `<script type="application/json" class="geo-payload">${serializeDocument(document)}</script>`;
}

function bootstrapBlock(runtimeUrl) {
    const url = JSON.stringify(runtimeUrl).replace(/</g, "\\u003c");
    return (
        `<script type="module" class="geo-bootstrap">import { mountAll } from ${url};\n` +
        `mountAll(document);</script>`
    );
}

/** bootstrap paired with an embedded runtime (window.GeometryDSLInteractive) */
function globalBootstrapBlock() {
    return (
        `<script class="geo-bootstrap">window.${GLOBAL_NAME}.mountAll(document);</script>`
    );
}
