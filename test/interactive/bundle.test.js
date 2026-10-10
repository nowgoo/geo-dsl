/**
 * Runtime bundler + inline mode tests (dev_plan_v0.3 D3, spec_v0.3 §3):
 * the generated single-file runtime executes and mounts with the same stub
 * DOM the source-level runtime uses; renderer embeds it correctly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { compile, renderSVG, serializeDocument, toScreen } from "../../src/index.js";
import { bundleRuntime } from "../../scripts/bundle-runtime.mjs";
import { mount } from "../../src/interactive/runtime.js";
import { el, stubDom, dragEvent } from "./stub-dom.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadBundle() {
    const code = bundleRuntime(rootDir);
    const sandbox = { module: { exports: {} }, console };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.module.exports;
}

function stubSvg(source) {
    const compiled = compile(source);
    const scene = el("g", { class: "geo-scene" });
    const payloadScript = el("script", { type: "application/json", class: "geo-payload" });
    payloadScript.textContentValue = serializeDocument(compiled);
    const svg = el("svg", { class: "geo-interactive" }, [scene, payloadScript]);
    return { svg, scene, compiled };
}

test("bundled runtime exposes the same API and mounts a figure", () => {
    const api = loadBundle();
    assert.equal(typeof api.mount, "function");
    assert.equal(typeof api.mountAll, "function");

    const { svg } = stubSvg("A = (0,0)\nB = (6,0)\nAB");
    const controller = api.mount(svg, stubDom);
    assert.ok(controller, "controller returned");
    assert.ok(svg.listeners.pointerdown, "events wired");

    // full drag through the bundled runtime
    const doc = controller.doc;
    const b = toScreen(doc.transform, doc.objects.get("B").geometry);
    svg.dispatch("pointerdown", dragEvent(b.x, b.y));
    svg.dispatch("pointermove", dragEvent(b.x + 25, b.y + 5));
    svg.dispatch("pointerup", dragEvent(b.x + 25, b.y + 5));
    const moved = doc.objects.get("B").geometry;
    assert.ok(moved.x > 6, `B moved: ${moved.x}`);
});

test("bundled runtime is idempotent per svg", () => {
    const api = loadBundle();
    const { svg } = stubSvg("A = (0,0)\nB = (4,0)\nAB");
    assert.ok(api.mount(svg, stubDom));
    assert.equal(api.mount(svg, stubDom), null);
});

test("renderer inline mode embeds runtime + global bootstrap, keeps payload", () => {
    const source = bundleRuntime(rootDir);
    const svg = renderSVG(compile("A = (0,0)\nB = (4,0)\nAB"), {
        interactive: { runtimeSource: source },
    });
    assert.ok(svg.includes("<script>/*! geometry-dsl interactive runtime"), "runtime embedded first");
    assert.ok(svg.includes('class="geo-payload"'), "payload still present");
    const payloadAt = svg.indexOf('class="geo-payload"');
    const runtimeAt = svg.indexOf("<script>/*! geometry-dsl");
    const bootstrapAt = svg.lastIndexOf('class="geo-bootstrap"');
    assert.ok(payloadAt < runtimeAt && runtimeAt < bootstrapAt, "payload < runtime < bootstrap");
    assert.ok(
        svg
            .trimEnd()
            .endsWith('<script class="geo-bootstrap">window.GeometryDSLInteractive.mountAll(document);</script>\n</svg>'),
        "global bootstrap is the final script",
    );

    // behavioral: the embedded runtime + bootstrap contract actually mounts
    const api = loadBundle();
    const { svg: stub } = stubSvg("A = (0,0)\nB = (4,0)\nAB");
    const doc = { querySelectorAll: (sel) => (sel === "svg.geo-interactive" ? [stub] : []) };
    const sandbox = vm.createContext({ window: { GeometryDSLInteractive: api }, doc, console });
    vm.runInContext("window.GeometryDSLInteractive.mountAll(doc);", sandbox);
    assert.ok(stub.listeners.pointerdown, "bootstrap mounted the figure");
});

test("source-level mount and bundle-level mount produce identical results", () => {
    const SRC = "A = (0,0)\nB = (6,0)\nAB\nD = mid(AB)";
    const sourceController = mount(stubSvg(SRC).svg, stubDom);
    const bundleController = loadBundle().mount(stubSvg(SRC).svg, stubDom);

    const b1 = toScreen(sourceController.doc.transform, sourceController.doc.objects.get("B").geometry);
    const b2 = toScreen(bundleController.doc.transform, bundleController.doc.objects.get("B").geometry);
    for (const c of [sourceController, bundleController]) {
        const svg = c === sourceController ? stubSvg(SRC).svg : null;
        void svg;
    }
    sourceController.session.begin({ kind: "point", name: "B" }, b1);
    sourceController.session.move({ x: b1.x + 10, y: b1.y });
    sourceController.session.end();
    bundleController.session.begin({ kind: "point", name: "B" }, b2);
    bundleController.session.move({ x: b2.x + 10, y: b2.y });
    bundleController.session.end();

    assert.deepEqual(
        { ...sourceController.doc.objects.get("B").geometry },
        { ...bundleController.doc.objects.get("B").geometry },
    );
});
