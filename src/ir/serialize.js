/**
 * Document ⇄ payload JSON (spec_v0.3 §4).
 *
 * IR definitions and canonical constraint nodes are plain data (nested
 * { type, ... } objects), so serialization is a recursive copy that strips
 * source positions. Rehydration restores Maps/Sets and re-evaluates via the
 * engine; only UnknownPointDefinition points need a solved-coordinate
 * snapshot (their geometry comes from the v0.2 solver, not a definition).
 *
 * Deterministic: maps expand in insertion (= document) order (Rule 9).
 */

import { Document, GeometryObject, Canvas } from "./document.js";
import { Point } from "./geometry.js";

export const PAYLOAD_VERSION = 1;

/** recursive copy dropping `position` fields (payload carries no source data) */
function stripPosition(value) {
    if (Array.isArray(value)) {
        return value.map(stripPosition);
    }
    if (value !== null && typeof value === "object") {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            if (key === "position") continue;
            out[key] = stripPosition(item);
        }
        return out;
    }
    return value;
}

/**
 * Document -> plain payload object (spec_v0.3 §4, frozen shape).
 */
export function documentToPayload(document) {
    if (!document.transform) {
        throw new Error("document has no layout; call layout() before serializeDocument()");
    }

    const objects = [];
    for (const object of document.objects.values()) {
        const unknown = object.definition.type === "UnknownPointDefinition";
        objects.push({
            name: object.name,
            kind: object.kind,
            definition: stripPosition(object.definition),
            dependencies: [...object.dependencies],
            // free points (literal) and unknown points are draggable (spec_v0.3 §5.1)
            draggable:
                object.definition.type === "PointLiteralDefinition" || unknown,
            unknown,
            solved: unknown && object.geometry ? [object.geometry.x, object.geometry.y] : null,
        });
    }

    const styles = {};
    for (const [selector, blocks] of document.styles) {
        styles[selector] = blocks.map((block) => [...block.properties.entries()]);
    }

    const labels = document.labels.map((label) => ({
        target: label.target.name,
        text: label.text,
        offset: label.offset ? { x: label.offset.x, y: label.offset.y } : null,
    }));

    const marks = document.marks.map((mark) => ({
        kind: mark.kind,
        args: mark.args.map(stripPosition),
    }));

    const constraints = document.constraints.map(stripPosition);

    const mode =
        document.unknowns.size > 0 ? "solve"
        : document.constraints.length > 0 ? "assert"
        : "free";

    return {
        version: PAYLOAD_VERSION,
        mode,
        canvas: {
            width: document.canvas.width,
            height: document.canvas.height,
            padding: document.canvas.padding,
        },
        transform: { ...document.transform },
        objects,
        styles,
        labels,
        marks,
        constraints,
    };
}

/** Document -> deterministic JSON string safe for embedding in <script> */
export function serializeDocument(document) {
    return JSON.stringify(documentToPayload(document)).replace(/</g, "\\u003c");
}

/**
 * payload object -> Document (unevaluated except solved unknown points).
 * Callers run evaluate() (and optionally the solver) afterwards.
 */
export function documentFromPayload(payload) {
    if (!payload || payload.version !== PAYLOAD_VERSION) {
        throw new Error(
            `geometry payload version mismatch: expected ${PAYLOAD_VERSION}, got ${payload?.version}`,
        );
    }

    const document = new Document();

    for (const entry of payload.objects) {
        const object = new GeometryObject({
            id: entry.name,
            name: entry.name,
            kind: entry.kind,
            definition: entry.definition,
            dependencies: entry.dependencies ?? [],
            position: null,
        });
        if (entry.unknown && entry.solved) {
            object.geometry = new Point(entry.solved[0], entry.solved[1]);
        }
        document.objects.set(entry.name, object);
    }

    for (const [selector, blocks] of Object.entries(payload.styles ?? {})) {
        document.styles.set(
            selector,
            blocks.map((pairs) => ({ properties: new Map(pairs), position: null })),
        );
    }

    document.labels = (payload.labels ?? []).map((label) => ({
        target: { name: label.target },
        text: label.text,
        offset: label.offset ? { x: label.offset.x, y: label.offset.y } : null,
        position: null,
        resolved: null,
    }));

    document.marks = (payload.marks ?? []).map((mark) => ({
        kind: mark.kind,
        args: mark.args,
        position: null,
        resolved: null,
    }));

    document.constraints = payload.constraints ?? [];
    document.unknowns = new Set(
        payload.objects.filter((o) => o.unknown).map((o) => o.name),
    );

    const canvas = new Canvas();
    canvas.width = payload.canvas.width;
    canvas.height = payload.canvas.height;
    canvas.padding = payload.canvas.padding;
    document.canvas = canvas;

    document.transform = { ...payload.transform };
    return document;
}
