/**
 * Style resolution (spec §34-36): default <- type <- object, merged in
 * document order. Deterministic; exact default values per §35.1.
 */

export const DEFAULT_STYLES = {
    point: { radius: 4, fill: "#222222" },
    line: { stroke: "#222222", width: 2 },
    segment: { stroke: "#222222", width: 2 },
    ray: { stroke: "#222222", width: 2 },
    circle: { stroke: "#222222", width: 2, fill: "none" },
    arc: { stroke: "#222222", width: 2, fill: "none" },
    polygon: { stroke: "#222222", width: 2, fill: "none" },
    polyline: { stroke: "#222222", width: 2 },
    marks: { stroke: "#222222", width: 1.5 },
    labels: {
        font: "serif",
        font_style: "italic",
        font_size: 14,
        label_color: "#222222",
        label_offset: { x: 8, y: -8 },
    },
};

const KIND_FOR_SELECTOR = new Set([
    "point", "line", "segment", "ray", "circle", "arc", "polygon", "polyline",
]);

/**
 * Build selector -> properties maps once per render.
 */
export function buildStyleIndex(document) {
    const typeStyles = new Map(); // kind -> merged plain object
    const objectStyles = new Map(); // object name -> merged plain object

    for (const [selector, blocks] of document.styles) {
        const merged = {};
        for (const block of blocks) {
            for (const [key, value] of block.properties) {
                merged[key] = value;
            }
        }
        if (KIND_FOR_SELECTOR.has(selector)) {
            typeStyles.set(selector, merged);
        } else {
            objectStyles.set(selector, merged);
        }
    }
    return { typeStyles, objectStyles };
}

/**
 * Resolve the effective style for an object: default <- type <- object.
 */
export function styleFor(document, kind, name, index) {
    const { typeStyles, objectStyles } = index;
    const base = DEFAULT_STYLES[kind] ?? {};
    const type = typeStyles.get(kind) ?? {};
    const object = objectStyles.get(name) ?? {};
    return { ...base, ...type, ...object };
}

export function markStyle() {
    return DEFAULT_STYLES.marks;
}

/** v0.1: "labels" is not a valid style selector, so labels use pure defaults (§35.1) */
export function labelStyle() {
    return DEFAULT_STYLES.labels;
}
