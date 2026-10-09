import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { compile, renderSVG } from "../../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- §74 acceptance ----------------------------------------------------------------

test("§74 acceptance: right triangle with altitude foot and right-angle mark", () => {
    const source = readFileSync(join(root, "examples", "right_triangle.geo"), "utf8");
    const doc = compile(source);

    // E = h * AB = (2, 0)
    const e = doc.objects.get("E").geometry;
    assert.ok(near(e.x, 2) && near(e.y, 0), `E should be (2,0), got (${e.x}, ${e.y})`);

    // h is the perpendicular through C
    assert.equal(doc.objects.get("h").geometry.type, "Line");

    // D = mid(AB) = (3, 0)
    const d = doc.objects.get("D").geometry;
    assert.ok(near(d.x, 3) && near(d.y, 0));

    // right-angle mark resolved at E
    assert.equal(doc.marks.length, 1);
    assert.equal(doc.marks[0].kind, "right_angle");
    assert.ok(near(doc.marks[0].resolved.vertex.x, 2));

    const svg = renderSVG(doc);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="400" viewBox="0 0 600 400">/);
    assert.match(svg, /<\/svg>$/);
});

// --- §75 acceptance ------------------------------------------------------------------

test("§75 acceptance: extended medians with equal-length marks", () => {
    const source = readFileSync(join(root, "examples", "extended_medians.geo"), "utf8");
    const doc = compile(source);

    // G = AD * BE is the centroid of (0,0),(8,0),(3,5) = (11/3, 5/3)
    const g = doc.objects.get("G").geometry;
    assert.ok(near(g.x, 11 / 3) && near(g.y, 5 / 3), `G should be (11/3, 5/3), got (${g.x}, ${g.y})`);

    // midpoints
    const d = doc.objects.get("D").geometry; // mid(BC) = (5.5, 2.5)
    assert.ok(near(d.x, 5.5) && near(d.y, 2.5));
    const f = doc.objects.get("F").geometry; // mid(AB) = (4, 0)
    assert.ok(near(f.x, 4) && near(f.y, 0));

    // three equal_length marks
    assert.equal(doc.marks.length, 3);
    for (const mark of doc.marks) {
        assert.equal(mark.kind, "equal_length");
        assert.equal(mark.resolved.length, 2);
    }

    const svg = renderSVG(doc);
    assert.match(svg, /width="800" height="600" viewBox="0 0 800 600"/);
    assert.match(svg, /<\/svg>$/);
});

// --- CLI e2e ----------------------------------------------------------------------------

const CLI = join(root, "cli", "geometry.js");

function runCli(args) {
    return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("cli: render to stdout", () => {
    const result = runCli(["render", join(root, "examples", "triangle.geo")]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test("cli: -o writes file", () => {
    const dir = mkdtempSync(join(tmpdir(), "geometry-"));
    const out = join(dir, "out.svg");
    const result = runCli(["render", join(root, "examples", "triangle.geo"), "-o", out]);
    assert.equal(result.status, 0, result.stderr);
    const svg = readFileSync(out, "utf8");
    assert.match(svg, /<\/svg>$/);
});

test("cli: --width/--height/--padding override canvas (§66)", () => {
    const result = runCli([
        "render", join(root, "examples", "right_triangle.geo"),
        "--width", "1200", "--height", "800", "--padding", "50",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /width="1200" height="800" viewBox="0 0 1200 800"/);
});

test("cli: errors print name, message, source line and caret, exit 1 (§48)", () => {
    const dir = mkdtempSync(join(tmpdir(), "geometry-"));
    const bad = join(dir, "bad.geo");
    writeFileSync(bad, "A = (0,0)\nB = (6,0)\nX = AB * CD\n");
    const result = runCli(["render", bad]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /NameError:/);
    assert.match(result.stderr, /undefined point "C"/);
    assert.match(result.stderr, /3 \| X = AB \* CD/);
    assert.match(result.stderr, /\^/);
});

test("cli: --help and unknown command", () => {
    assert.match(runCli(["--help"]).stdout, /usage|geometry render/i);
    assert.equal(runCli(["frobnicate"]).status, 1);
});

test("cli: all examples render", () => {
    for (const file of readdirSync(join(root, "examples"))) {
        const result = runCli(["render", join(root, "examples", file)]);
        assert.equal(result.status, 0, `${file}: ${result.stderr}`);
        assert.match(result.stdout, /<\/svg>/);
    }
});
