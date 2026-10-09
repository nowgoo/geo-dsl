#!/usr/bin/env node
/**
 * Regenerate golden SVG files: node scripts/update-golden.js
 * Review the git diff before committing.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, renderSVG } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = join(root, "examples");
const goldenDir = join(root, "test", "render", "golden");
mkdirSync(goldenDir, { recursive: true });

for (const file of readdirSync(examplesDir).filter((f) => f.endsWith(".geo"))) {
    const source = readFileSync(join(examplesDir, file), "utf8");
    const svg = renderSVG(compile(source));
    const out = join(goldenDir, file.replace(/\.geo$/, ".svg"));
    writeFileSync(out, svg);
    console.log("updated", out);
}
