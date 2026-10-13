/**
 * Interactive golden tests (spec_v0.3 §8): opt-in interactive output is
 * deterministic and snapshot-tested separately from the static goldens
 * (which must stay byte-identical to previous versions).
 * Regenerate with: UPDATE_GOLDEN=1 node --test test/render/interactive-golden.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, renderSVG } from "../../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const examplesDir = join(root, "examples");
const goldenDir = join(root, "test", "render", "golden-interactive");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

// interactive-mode coverage: marks/labels/points, style overrides, solved unknowns
const cases = ["right_triangle", "circumcircle", "solve_sss", "styles", "hide"];
const RUNTIME_URL = "./geometry-dsl-runtime.js";

for (const name of cases) {
    test(`interactive golden: ${name}`, () => {
        const source = readFileSync(join(examplesDir, `${name}.geo`), "utf8");
        const svg = renderSVG(compile(source), {
            interactive: { runtimeUrl: RUNTIME_URL },
        });

        const goldenPath = join(goldenDir, `${name}.svg`);
        if (UPDATE || !existsSync(goldenPath)) {
            mkdirSync(goldenDir, { recursive: true });
            writeFileSync(goldenPath, svg);
        }
        assert.equal(svg, readFileSync(goldenPath, "utf8"), `differs from golden ${name}.svg`);
    });
}

test("interactive golden: deterministic double render", () => {
    for (const name of cases) {
        const source = readFileSync(join(examplesDir, `${name}.geo`), "utf8");
        const options = { interactive: { runtimeUrl: RUNTIME_URL } };
        assert.equal(renderSVG(compile(source), options), renderSVG(compile(source), options));
    }
});

test("interactive output structure: scene/style/payload/bootstrap", () => {
    const source = readFileSync(join(examplesDir, "right_triangle.geo"), "utf8");
    const svg = renderSVG(compile(source), { interactive: true });

    assert.ok(svg.includes("<svg"), "svg root");
    assert.ok(svg.includes('class="geo-interactive"'), "root class");
    assert.ok(svg.includes('<g class="geo-scene">'), "scene group");
    assert.ok(svg.includes('class="geo-obj"'), "object wrappers");
    assert.ok(svg.includes("data-geo-name="), "name attributes");
    assert.ok(svg.includes("data-geo-kind="), "kind attributes");
    assert.ok(svg.includes("data-geo-label="), "label wrappers");
    assert.ok(svg.includes("<title>"), "hover titles");
    assert.ok(svg.includes("<style>"), "interaction css");
    assert.ok(svg.includes('class="geo-payload"'), "payload script");
    assert.ok(svg.includes('class="geo-bootstrap"'), "bootstrap script");
    assert.ok(svg.includes("geo-payload"), "payload before bootstrap");
    const payloadAt = svg.indexOf('class="geo-payload"');
    const bootstrapAt = svg.indexOf('class="geo-bootstrap"');
    assert.ok(payloadAt < bootstrapAt, "payload precedes bootstrap");
});

test("default renderSVG output has no interactive artifacts", () => {
    const source = readFileSync(join(examplesDir, "right_triangle.geo"), "utf8");
    const svg = renderSVG(compile(source));
    for (const marker of [
        "geo-interactive",
        "geo-scene",
        "geo-obj",
        "data-geo-",
        "geo-payload",
        "geo-bootstrap",
        "<style>",
        "<title>",
        "<script",
    ]) {
        assert.ok(!svg.includes(marker), `static output must not contain ${marker}`);
    }
});
