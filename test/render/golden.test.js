/**
 * Golden / snapshot tests (spec §65): every example renders to a stored
 * golden SVG. Regenerate with: node scripts/update-golden.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, renderSVG } from "../../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const examplesDir = join(root, "examples");
const goldenDir = join(root, "test", "render", "golden");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const examples = readdirSync(examplesDir).filter((f) => f.endsWith(".geo")).sort();

for (const example of examples) {
    const name = example.replace(/\.geo$/, "");

    test(`golden: ${name}`, () => {
        const source = readFileSync(join(examplesDir, example), "utf8");
        const svg = renderSVG(compile(source));

        const goldenPath = join(goldenDir, `${name}.svg`);
        if (UPDATE || !existsSync(goldenPath)) {
            mkdirSync(goldenDir, { recursive: true });
            writeFileSync(goldenPath, svg);
        }
        const golden = readFileSync(goldenPath, "utf8");
        assert.equal(svg, golden, `output differs from golden file ${name}.svg`);
    });
}

test("golden: deterministic double render for all examples", () => {
    for (const example of examples) {
        const source = readFileSync(join(examplesDir, example), "utf8");
        const svg1 = renderSVG(compile(source));
        const svg2 = renderSVG(compile(source));
        assert.equal(svg1, svg2, `non-deterministic output: ${example}`);
    }
});
