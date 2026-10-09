/**
 * CLI integration tests for v0.2: exit codes, formatted constraint errors,
 * canvas overrides on solver programs, file output.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = join(import.meta.dirname, "..", "..", "cli", "geometry.js");
const root = join(import.meta.dirname, "..", "..");

function run(source, args = []) {
    const file = join(mkdtempSync(join(tmpdir(), "geodsl-")), "input.geo");
    writeFileSync(file, source);
    return spawnSync(process.execPath, [cli, "render", file, ...args], {
        cwd: root,
        encoding: "utf8",
    });
}

test("cli: valid assertion program exits 0 and prints SVG", () => {
    const result = run("A = (0, 0)\nB = (2, 0)\nC = (2, 1)\nAB _|_ BC");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /<svg/);
});

test("cli: violated constraint exits 1 with source line and caret", () => {
    const result = run("A = (0, 0)\nB = (2, 0)\nC = (3, 1)\nAB _|_ BC");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /constraint violated: AB _\|_ BC/);
    assert.match(result.stderr, /4 \| AB _\|_ BC/);
    assert.match(result.stderr, /\^/);
});

test("cli: solver program exits 0 and labels the solved point", () => {
    const result = run("A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = 3\nlabel C");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /<svg/);
    assert.match(result.stdout, />C</);
});

test("cli: under-constrained system exits 1 with ConstraintError", () => {
    const result = run("A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ConstraintError/);
    assert.match(result.stderr, /under-constrained system: 1 degree of freedom left/);
});

test("cli: inconsistent system exits 1 with the constraint position", () => {
    const result = run("A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3\nAC = 5");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /over-constrained or inconsistent/);
    assert.match(result.stderr, /4 \| AC = 3/);
});

test("cli: --width override works on solver programs", () => {
    const result = run("A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = 3", ["--width", "800"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /width="800"/);
});

test("cli: -o writes the solved diagram to a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "geodsl-"));
    const out = join(dir, "out.svg");
    const result = run("A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = 3", ["-o", out]);
    assert.equal(result.status, 0);
    assert.match(readFileSync(out, "utf8"), /<svg/);
});

test("cli: _|_ without whitespace exits 1 with SyntaxError", () => {
    const result = run("A = (0, 0)\nB = (2, 0)\nC = (2, 1)\nAB_|_BC");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SyntaxError/);
    assert.match(result.stderr, /must be surrounded by whitespace/);
});

test("cli: lowercase unknown r = ? exits 1 with SyntaxError", () => {
    const result = run("r = ?");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SyntaxError/);
    assert.match(result.stderr, /single uppercase/);
});

test("cli: all v0.2 examples render with exit code 0", () => {
    const examples = [
        "constraint_perpendicular.geo",
        "constraint_parallel.geo",
        "constraint_between.geo",
        "constraint_equal_length.geo",
        "constraint_angle.geo",
        "solve_collinear.geo",
        "solve_square.geo",
        "solve_sss.geo",
    ];
    for (const example of examples) {
        const result = spawnSync(process.execPath, [cli, "render", join(root, "examples", example)], {
            cwd: root,
            encoding: "utf8",
        });
        assert.equal(result.status, 0, `${example} failed: ${result.stderr}`);
        assert.match(result.stdout, /<svg/);
    }
});
