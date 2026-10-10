/**
 * Browser runtime (spec_v0.3 §2, plan M3): mounts an interactive SVG
 * produced by `renderSVG(document, { interactive })`.
 *
 * Loaded as an ES module via the bootstrap script's RUNTIME_URL; also
 * re-exported from src/index.js so bundlers/CDN entry points work.
 *
 * Layering: this module owns all DOM access (events, innerHTML, classList);
 * all geometry/decision logic lives in ./core.js (pure, Node-testable).
 * Re-render regenerates the scene group's children via the normal renderer
 * (spec_v0.3 §3); listeners are delegated on the svg root, so innerHTML
 * replacement cannot orphan them (plan D14).
 */

import { renderSceneChildren } from "../render/svg/renderer.js";
import { createInteractiveDocument, hitTest, createSession } from "./core.js";

const mounted = new WeakSet();

/** mount every unmounted svg.geo-interactive under `root` (a Document) */
export function mountAll(root) {
    for (const svg of root.querySelectorAll("svg.geo-interactive")) {
        try {
            mount(svg);
        } catch (error) {
            // one broken figure must not break the page; keep it static
            if (typeof console !== "undefined") console.error("geo mount failed:", error);
        }
    }
}

/** mount a single svg; returns the controller (tests / advanced use) */
export function mount(svg, dom = defaultDom) {
    if (mounted.has(svg)) return null;
    const payloadScript = dom.querySelector(svg, "script.geo-payload");
    const scene = dom.querySelector(svg, "g.geo-scene");
    if (!payloadScript || !scene) {
        throw new Error("geo: svg is missing geo-payload/geo-scene; not an interactive figure");
    }

    const payload = JSON.parse(dom.textContent(payloadScript));
    const doc = createInteractiveDocument(payload);
    const session = createSession(doc, { mode: payload.mode ?? "free" });

    const controller = {
        doc,
        session,

        /** regenerate the scene children and re-apply client-side state */
        render() {
            dom.innerHTML(scene, renderSceneChildren(doc, true));
            this.applyLabelOffsets();
            this.applySelection();
        },

        applyLabelOffsets() {
            for (const [name, off] of session.labelOffsets) {
                if (!off.x && !off.y) continue;
                const el = dom.querySelector(scene, `g[data-geo-label="${cssEscape(name)}"]`);
                if (el) dom.setAttribute(el, "transform", `translate(${off.x} ${off.y})`);
            }
        },

        applySelection() {
            for (const el of dom.querySelectorAll(scene, ".is-selected")) {
                dom.removeClass(el, "is-selected");
            }
            if (!session.selected) return;
            for (const el of dom.querySelectorAll(scene, `g[data-geo-name="${cssEscape(session.selected)}"]`)) {
                dom.addClass(el, "is-selected");
            }
        },

        showError(message) {
            dom.addClass(svg, "is-error");
            dom.setAttribute(svg, "data-geo-error", message);
        },

        clearError() {
            dom.removeClass(svg, "is-error");
            dom.removeAttribute(svg, "data-geo-error");
        },
    };

    dom.addEventListener(svg, "pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const p = dom.svgPoint(svg, event.clientX, event.clientY);
        const hit = hitTest(doc, p, { labelOffsets: session.labelOffsets });
        const result = session.begin(hit, p);
        if (result.started) {
            dom.setPointerCapture(svg, event.pointerId);
            dom.addClass(svg, "is-dragging");
        }
        controller.applySelection();
        if (result.started) event.preventDefault();
    });

    dom.addEventListener(svg, "pointermove", (event) => {
        if (!session.dragging) return;
        const p = dom.svgPoint(svg, event.clientX, event.clientY);
        const result = session.move(p);
        if (result.changed) controller.render();
        if (result.error) controller.showError(result.error);
        else controller.clearError();
    });

    const finish = (cancelled) => {
        if (!session.dragging) return;
        dom.removeClass(svg, "is-dragging");
        const result = cancelled ? session.cancel() : session.end();
        if (result.changed) controller.render();
        if (result.error) controller.showError(result.error);
        else controller.clearError();
    };
    dom.addEventListener(svg, "pointerup", () => finish(false));
    dom.addEventListener(svg, "pointercancel", () => finish(true));

    mounted.add(svg);
    return controller;
}

function cssEscape(name) {
    // object names are [A-Za-z_][A-Za-z0-9_]* (§5); defensive escaping only
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name)
        : name.replace(/[^A-Za-z0-9_-]/g, "\\$&");
}

/** injectable DOM adapter (plan D12): replace in tests with a stub */
export const defaultDom = {
    querySelector(el, selector) {
        return el.querySelector(selector);
    },
    querySelectorAll(el, selector) {
        return [...el.querySelectorAll(selector)];
    },
    textContent(el) {
        return el.textContent;
    },
    innerHTML(el, html) {
        el.innerHTML = html;
    },
    setAttribute(el, name, value) {
        el.setAttribute(name, value);
    },
    removeAttribute(el, name) {
        el.removeAttribute(name);
    },
    addClass(el, cls) {
        el.classList.add(cls);
    },
    removeClass(el, cls) {
        el.classList.remove(cls);
    },
    addEventListener(el, type, fn) {
        el.addEventListener(type, fn);
    },
    setPointerCapture(el, pointerId) {
        try {
            el.setPointerCapture(pointerId);
        } catch {
            // detached nodes etc. — dragging still works without capture
        }
    },
    /** client coordinates -> svg user units (viewBox space) */
    svgPoint(svg, clientX, clientY) {
        const matrix = svg.getScreenCTM();
        if (!matrix) return { x: clientX, y: clientY };
        const point = svg.createSVGPoint
            ? svg.createSVGPoint()
            : new DOMPoint(clientX, clientY);
        point.x = clientX;
        point.y = clientY;
        const local = point.matrixTransform(matrix.inverse());
        return { x: local.x, y: local.y };
    },
};
