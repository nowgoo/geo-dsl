/**
 * Solver tests (plan M4/M5): convergence, three-state failure classification,
 * DOF diagnosis, determinism (double compile byte-equal, Rule 9), and
 * integration of solved documents with layout/render.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { compile, renderSVG } from "../../src/index.js";
import { ConstraintErrorDSLError } from "../../src/errors.js";

/** compile a program with unknowns and return solved point geometries */
function solve(source) {
    const doc = compile(source);
    const out = {};
    for (const [name, object] of doc.objects) {
        if (object.kind === "Point" && object.geometry) {
            out[name] = object.geometry;
        }
    }
    return out;
}

function expectConstraintError(source, pattern) {
    assert.throws(() => compile(source), (e) => {
        assert.equal(e.name, "ConstraintError", `expected ConstraintError, got ${e.name}: ${e.message}`);
        if (pattern) assert.match(e.message, pattern);
        return true;
    });
}

/** distance between two solved points */
function dist(p, q) {
    return Math.hypot(p.x - q.x, p.y - q.y);
}

// --- convergence: unknown points reach the constrained configuration -------------

test("solve: A-C-B + AC = 3 places C at (3, 0)", () => {
    const { C } = solve("A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = 3");
    assert.ok(Math.abs(C.x - 3) < 1e-3);
    assert.ok(Math.abs(C.y) < 1e-2);
});

test("solve: SSS triangle |AC|=3, |BC|=2", () => {
    const { A, B, C } = solve("A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3\nBC = 2");
    assert.ok(Math.abs(dist(A, C) - 3) < 1e-6, `|AC| = ${dist(A, C)}`);
    assert.ok(Math.abs(dist(B, C) - 2) < 1e-6, `|BC| = ${dist(B, C)}`);
});

test("solve: square from side chains (6 constraints, 4 unknowns, redundant)", () => {
    const { A, B, C, D } = solve(`
A = (0, 0)
B = (4, 0)
C = ?
D = ?
AB = BC
BC = CD
CD = DA
AB _|_ BC
BC _|_ CD
`);
    assert.ok(Math.abs(C.x - 4) < 1e-4 && Math.abs(Math.abs(C.y) - 4) < 1e-4, `C = (${C.x}, ${C.y})`);
    assert.ok(Math.abs(D.x) < 1e-4 && Math.abs(Math.abs(D.y) - 4) < 1e-4, `D = (${D.x}, ${D.y})`);
    assert.ok(Math.abs(dist(A, B) - 4) < 1e-5);
});

test("solve: isosceles via angle equality + AC = 3 -> C = (2, ±√5)", () => {
    const { A, B, C } = solve("A = (0, 0)\nB = (4, 0)\nC = ?\nangle(B, A, C) = angle(A, B, C)\nAC = 3");
    assert.ok(Math.abs(C.x - 2) < 1e-5, `C.x = ${C.x}`);
    assert.ok(Math.abs(Math.abs(C.y) - Math.sqrt(5)) < 1e-5, `C.y = ${C.y}`);
});

test("solve: right isosceles via _|_ + equal legs -> C = (2, ±2)", () => {
    const { C } = solve("A = (0, 0)\nB = (4, 0)\nC = ?\nAC _|_ BC\nAC = BC");
    assert.ok(Math.abs(C.x - 2) < 1e-4, `C.x = ${C.x}`);
    assert.ok(Math.abs(Math.abs(C.y) - 2) < 1e-4, `C.y = ${C.y}`);
});

test("solve: rectangle with fixed height (redundant consistent)", () => {
    const { C, D } = solve(`
A = (0, 0)
B = (6, 0)
C = ?
D = ?
AB _|_ BC
BC _|_ CD
CD _|_ DA
DA _|_ AB
BC = 2
`);
    assert.ok(Math.abs(Math.abs(C.x) - 6) < 1e-4, `C = (${C.x}, ${C.y})`);
    assert.ok(Math.abs(Math.abs(C.y) - 2) < 1e-4, `C = (${C.x}, ${C.y})`);
    assert.ok(Math.abs(Math.abs(D.x)) < 1e-4 && Math.abs(Math.abs(D.y) - 2) < 1e-4, `D = (${D.x}, ${D.y})`);
});

test("solve: equilateral via angle = 60 + AC = BC", () => {
    const { A, B, C } = solve(`
A = (0, 0)
B = (4, 0)
C = ?
angle(A, B, C) = 60
AC = BC
`);
    assert.ok(Math.abs(C.x - 2) < 1e-4, `C.x = ${C.x}`);
    assert.ok(Math.abs(Math.abs(C.y) - 2 * Math.sqrt(3)) < 1e-4, `C.y = ${C.y}`);
    assert.ok(Math.abs(dist(A, C) - 4) < 1e-4);
});

test("solve: distance constraint on a measurement expression", () => {
    const { A, B, C } = solve("A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = distance(A, B) / 2");
    assert.ok(Math.abs(C.x - 2) < 1e-3, `C.x = ${C.x}`);
});

test("solve: unknown point referenced by a dependent construction", () => {
    const doc = compile(`
A = (0, 0)
B = (4, 0)
C = ?
D = mid(BC)
A-C-B
AC = 3
`);
    const D = doc.objects.get("D").geometry;
    const C = doc.objects.get("C").geometry;
    // D is the midpoint of B and C, whatever mirror the solver picked
    assert.ok(Math.abs(D.x - (C.x + 4) / 2) < 1e-6);
    assert.ok(Math.abs(D.y - C.y / 2) < 1e-6);
});

test("solve: mixed known/unknown system with perpendicular construction", () => {
    const { C } = solve(`
A = (0, 0)
B = (4, 0)
C = ?
h = perpendicular(C, AB)
AC = 3
angle(A, B, C) = 45
`);
    // angle at B = 45°, |AC| = 3 -> C = (1, ...)? |AC|=3, tan(45°)=1 => C on line y = x - 4 side...
    // verify constraints numerically instead of exact coordinates
    const A = { x: 0, y: 0 };
    const B = { x: 4, y: 0 };
    assert.ok(Math.abs(dist(A, C) - 3) < 1e-5, `|AC| = ${dist(A, C)}`);
    const angleDeg = Math.acos(
        ((A.x - B.x) * (C.x - B.x) + (A.y - B.y) * (C.y - B.y)) / (4 * dist(B, C)),
    ) * (180 / Math.PI);
    assert.ok(Math.abs(angleDeg - 45) < 1e-4, `angle at B = ${angleDeg}`);
});

// --- determinism (Rule 9) ---------------------------------------------------------

test("solve: double compile produces byte-identical SVG (square)", () => {
    const source = `
A = (0, 0)
B = (4, 0)
C = ?
D = ?
AB = BC
BC = CD
CD = DA
AB _|_ BC
BC _|_ CD
label A
label B
label C
label D
`;
    const svg1 = renderSVG(compile(source));
    const svg2 = renderSVG(compile(source));
    assert.equal(svg1, svg2);
});

test("solve: double compile produces byte-identical SVG (SSS)", () => {
    const source = "A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3\nBC = 2\nlabel C";
    const svg1 = renderSVG(compile(source));
    const svg2 = renderSVG(compile(source));
    assert.equal(svg1, svg2);
});

test("solve: solved points integrate with labels and marks", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (4, 0)
C = ?
D = ?
AB = BC
BC = CD
CD = DA
AB _|_ BC
label A
label C
mark right_angle(A, B, C)
`));
    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /C/); // label text present
});

// --- under-constrained (M5, D10) ---------------------------------------------------

test("solve: single length constraint leaves 1 DOF", () => {
    expectConstraintError(
        "A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3",
        /under-constrained system: 1 degree of freedom left/,
    );
});

test("solve: unconstrained unknown leaves 2 DOF", () => {
    expectConstraintError("C = ?", /under-constrained system: 2 degrees of freedom left/);
});

test("solve: rectangle without a height leaves 1 DOF shared by C and D", () => {
    expectConstraintError(
        `
A = (0, 0)
B = (6, 0)
C = ?
D = ?
AB _|_ BC
BC _|_ CD
CD _|_ DA
DA _|_ AB
`,
        /under-constrained system: 1 degree of freedom left/,
    );
});

test("solve: duplicate constraint is not redundancy — circle locus stays free", () => {
    expectConstraintError(
        "A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3\nAC = 3",
        /under-constrained system: 1 degree of freedom left/,
    );
});

// --- over-constrained / inconsistent (M5, D10) --------------------------------------

test("solve: contradictory lengths are reported as inconsistent", () => {
    expectConstraintError(
        "A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3\nAC = 5",
        /over-constrained or inconsistent/,
    );
});

test("solve: betweenness + incompatible lengths are inconsistent", () => {
    expectConstraintError(
        "A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = 3\nBC = 2",
        /over-constrained or inconsistent/,
    );
});

test("solve: fixed-segment length contradiction is inconsistent", () => {
    expectConstraintError(
        "A = (0, 0)\nB = (4, 0)\nC = ?\nAB = 10",
        /over-constrained or inconsistent|no convergence/,
    );
});

test("solve: inconsistent system reports the first constraint position", () => {
    try {
        compile("A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3\nAC = 5");
        assert.fail("expected throw");
    } catch (e) {
        assert.equal(e.name, "ConstraintError");
        assert.equal(e.line, 4);
    }
});

// --- solver tolerates degenerate intermediate geometry ------------------------------

test("solve: zero-initial guess that degenerates does not crash the solver", () => {
    // start 0 places C and D at (0,0), coincident with A: dependent segment
    // evaluation throws mid-solve; other starts recover
    const { C, D } = solve(`
A = (0, 0)
B = (4, 0)
C = ?
D = ?
AB = BC
BC = CD
CD = DA
AB _|_ BC
BC _|_ CD
`);
    assert.ok(Number.isFinite(C.x) && Number.isFinite(D.y));
});

// --- performance sanity -------------------------------------------------------------

test("solve: square system completes well under a second", () => {
    const t0 = performance.now();
    compile(`
A = (0, 0)
B = (4, 0)
C = ?
D = ?
AB = BC
BC = CD
CD = DA
AB _|_ BC
BC _|_ CD
`);
    const elapsed = performance.now() - t0;
    assert.ok(elapsed < 1000, `solver took ${elapsed}ms`);
});
