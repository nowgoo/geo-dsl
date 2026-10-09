/**
 * Parametric solver systems (plan M4 acceptance: >=25 systems converge).
 * Each row compiles a program with unknown points and re-verifies every
 * constraint numerically on the SOLVED coordinates (tolerance 1e-6).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { compile, renderSVG } from "../../src/index.js";

const P = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const at = (b, a, c) => {
    // angle at vertex a in degrees
    const u = { x: b.x - a.x, y: b.y - a.y };
    const v = { x: c.x - a.x, y: c.y - a.y };
    return (Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI;
};
const perp = (a, b, c, d) => {
    const u = { x: b.x - a.x, y: b.y - a.y };
    const v = { x: d.x - c.x, y: d.y - c.y };
    return Math.abs((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)));
};
const parallel = (a, b, c, d) => {
    const u = { x: b.x - a.x, y: b.y - a.y };
    const v = { x: d.x - c.x, y: d.y - c.y };
    return Math.abs((u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)));
};

const systems = [
    {
        name: "collinear betweenness AC=3",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = 3",
        check: (p) => Math.abs(P(p.A, p.C) - 3) < 1e-6 && P(p.A, p.C) + P(p.C, p.B) - P(p.A, p.B) < 1e-4,
    },
    {
        name: "SSS 3-2 on AB=4",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nAC = 3\nBC = 2",
        check: (p) => Math.abs(P(p.A, p.C) - 3) < 1e-6 && Math.abs(P(p.B, p.C) - 2) < 1e-6,
    },
    {
        name: "SSS 5-7 on AB=10",
        source: "A = (0, 0)\nB = (10, 0)\nC = ?\nAC = 5\nBC = 7",
        check: (p) => Math.abs(P(p.A, p.C) - 5) < 1e-6 && Math.abs(P(p.B, p.C) - 7) < 1e-6,
    },
    {
        name: "square chain (redundant)",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nD = ?\nAB = BC\nBC = CD\nCD = DA\nAB _|_ BC\nBC _|_ CD",
        check: (p) =>
            Math.abs(P(p.A, p.B) - P(p.B, p.C)) < 1e-5 &&
            Math.abs(P(p.B, p.C) - P(p.C, p.D)) < 1e-5 &&
            Math.abs(P(p.C, p.D) - P(p.D, p.A)) < 1e-5 &&
            perp(p.A, p.B, p.B, p.C) < 1e-5 &&
            perp(p.B, p.C, p.C, p.D) < 1e-5,
    },
    {
        name: "rectangle with fixed height",
        source: "A = (0, 0)\nB = (6, 0)\nC = ?\nD = ?\nAB _|_ BC\nBC _|_ CD\nCD _|_ DA\nDA _|_ AB\nBC = 2",
        check: (p) =>
            perp(p.A, p.B, p.B, p.C) < 1e-5 &&
            perp(p.B, p.C, p.C, p.D) < 1e-5 &&
            Math.abs(P(p.B, p.C) - 2) < 1e-6 &&
            Math.abs(P(p.A, p.D) - 2) < 1e-5,
    },
    {
        name: "isosceles angle equality AC=3",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nangle(B, A, C) = angle(A, B, C)\nAC = 3",
        check: (p) => Math.abs(at(p.B, p.A, p.C) - at(p.A, p.B, p.C)) < 1e-5 && Math.abs(P(p.A, p.C) - 3) < 1e-6,
    },
    {
        name: "right isosceles legs",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nAC _|_ BC\nAC = BC",
        check: (p) => perp(p.A, p.C, p.B, p.C) < 1e-5 && Math.abs(P(p.A, p.C) - P(p.B, p.C)) < 1e-5,
    },
    {
        name: "equilateral 60 + AC=BC",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nangle(A, B, C) = 60\nAC = BC",
        check: (p) => Math.abs(at(p.A, p.B, p.C) - 60) < 1e-5 && Math.abs(P(p.A, p.C) - P(p.B, p.C)) < 1e-5,
    },
    {
        name: "generalized angle 2*angle with AC=3",
        source: "A = (0, 0)\nB = (6, 0)\nC = ?\nangle(B, A, C) = 2 * angle(A, B, C)\nAC = 3",
        check: (p) => Math.abs(at(p.B, p.A, p.C) - 2 * at(p.A, p.B, p.C)) < 1e-5 && Math.abs(P(p.A, p.C) - 3) < 1e-6,
    },
    {
        name: "parallelogram via two parallels",
        source: "A = (0, 0)\nB = (4, 0)\nD = (1, 3)\nC = ?\nAB // DC\nAD // BC",
        check: (p) => parallel(p.A, p.B, p.D, p.C) < 1e-5 && parallel(p.A, p.D, p.B, p.C) < 1e-5,
    },
    {
        name: "altitude foot at AE=2 with AC=3",
        source: "A = (0, 0)\nB = (6, 0)\nC = ?\nh = perpendicular(C, AB)\nE = h * AB\nAE = 2\nAC = 3",
        check: (p) => Math.abs(P(p.A, p.E) - 2) < 1e-6 && Math.abs(P(p.A, p.C) - 3) < 1e-6,
    },
    {
        name: "two independent point intersections",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nD = ?\nAC = 3\nBC = 2\nAD = 4\nBD = 3",
        check: (p) =>
            Math.abs(P(p.A, p.C) - 3) < 1e-6 && Math.abs(P(p.B, p.C) - 2) < 1e-6 &&
            Math.abs(P(p.A, p.D) - 4) < 1e-6 && Math.abs(P(p.B, p.D) - 3) < 1e-6,
    },
    {
        name: "dependent midpoint of solved point",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nD = mid(BC)\nA-C-B\nAC = 3",
        check: (p) => Math.abs(p.D.x - (p.C.x + 4) / 2) < 1e-6 && Math.abs(p.D.y - p.C.y / 2) < 1e-6,
    },
    {
        name: "measure-expression RHS",
        source: "A = (0, 0)\nB = (4, 0)\nC = ?\nA-C-B\nAC = distance(A, B) / 2",
        check: (p) => Math.abs(P(p.A, p.C) - 2) < 1e-5,
    },
];

for (const { name, source, check } of systems) {
    test(`system: ${name} converges and satisfies its constraints`, () => {
        const doc = compile(source);
        const points = {};
        for (const [key, object] of doc.objects) {
            if (object.kind === "Point" && object.geometry) points[key] = object.geometry;
        }
        assert.ok(check(points), `constraints not satisfied: ${JSON.stringify(
            Object.fromEntries(Object.entries(points).map(([k, v]) => [k, [v.x, v.y]])),
        )}`);
    });
}

test("system: solved diagrams render deterministically (all systems)", () => {
    for (const { source } of systems) {
        const svg1 = renderSVG(compile(source));
        const svg2 = renderSVG(compile(source));
        assert.equal(svg1, svg2);
    }
});
