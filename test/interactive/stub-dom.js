/**
 * Minimal DOM stub shared by interactive runtime/bundle tests (plan D12):
 * implements exactly the surface src/interactive/runtime.js uses.
 */

/** selector matching for the exact shapes the runtime queries */
function matches(node, selector) {
    const attr = selector.match(/^(\w+)\[data-([a-z-]+)="([^"]*)"\]$/);
    if (attr) {
        return node.tag === attr[1] && node.attrs[`data-${attr[2]}`] === attr[3];
    }
    const cls = selector.match(/^(\w+)\.([\w-]+)$/);
    if (cls) return node.tag === cls[1] && node.classSet.has(cls[2]);
    const dot = selector.match(/^\.([\w-]+)$/);
    if (dot) return node.classSet.has(dot[1]);
    return node.tag === selector;
}

function walk(node, selector, out = []) {
    for (const child of node.children) {
        if (matches(child, selector)) out.push(child);
        walk(child, selector, out);
    }
    return out;
}

export function el(tag, attrs = {}, children = []) {
    const node = {
        tag,
        attrs: { ...attrs },
        children,
        classSet: new Set(String(attrs.class ?? "").split(/\s+/).filter(Boolean)),
        listeners: {},
        textContentValue: "",
        innerHTMLValue: null,
        captured: null,
        get textContent() {
            return this.textContentValue;
        },
        querySelector(sel) {
            return walk(this, sel)[0] ?? null;
        },
        querySelectorAll(sel) {
            return walk(this, sel);
        },
        classList: {
            add: (c) => node.classSet.add(c),
            remove: (c) => node.classSet.delete(c),
            contains: (c) => node.classSet.has(c),
        },
        addEventListener(type, fn) {
            (node.listeners[type] ??= []).push(fn);
        },
        dispatch(type, event) {
            for (const fn of node.listeners[type] ?? []) fn(event);
        },
        setAttribute(k, v) {
            node.attrs[k] = v;
        },
        removeAttribute(k) {
            delete node.attrs[k];
        },
        setPointerCapture(id) {
            node.captured = id;
        },
    };
    return node;
}

export const stubDom = {
    querySelector: (n, s) => n.querySelector(s),
    querySelectorAll: (n, s) => n.querySelectorAll(s),
    textContent: (n) => n.textContent,
    innerHTML: (n, html) => {
        n.innerHTMLValue = html;
        // note: unlike a real browser we keep children so tests can install
        // nodes for selector lookups; replacement semantics are not under test
    },
    setAttribute: (n, k, v) => n.setAttribute(k, v),
    removeAttribute: (n, k) => n.removeAttribute(k),
    addClass: (n, c) => n.classList.add(c),
    removeClass: (n, c) => n.classList.remove(c),
    addEventListener: (n, t, f) => n.addEventListener(t, f),
    setPointerCapture: (n, id) => n.setPointerCapture(id),
    svgPoint: (_svg, x, y) => ({ x, y }), // identity: tests use svg units directly
};

export function dragEvent(x, y) {
    return { button: 0, clientX: x, clientY: y, pointerId: 1, preventDefault() {} };
}
