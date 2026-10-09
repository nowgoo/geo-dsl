import { test } from "node:test";
import assert from "node:assert/strict";

import { compile, renderSVG } from "../../src/index.js";

const BASE = `
A = (0, 0)
B = (4, 0)
C = (0, 3)
ABC
`;

test("mark right_angle renders a square path at the vertex", () => {
    const svg = renderSVG(compile(`${BASE}
E = (0, 0)
mark right_angle(A, B, C)
`));
    // vertex is B=(4,0): right-angle square arms go toward A and C
    assert.match(svg, /<path d="M [^"]+ L [^"]+ L [^"]+" stroke="#222222" stroke-width="1\.5" fill="none"\/>/);
});

test("mark equal_length renders tick marks on both segments", () => {
    const svg = renderSVG(compile(`${BASE}
D = mid(AB)
mark equal_length(AD, DB)
`));
    // two tick paths (one per segment)
    const ticks = svg.match(/<path d="M [^"]+ L [^"]+" stroke="#222222"/g) ?? [];
    assert.equal(ticks.length, 2);
});

test("mark parallel renders two chevrons", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (4, 0)
AB
C = (0, 3)
D = (4, 3)
CD
mark parallel(AB, CD)
`));
    // chevron paths have 3 points (M + 2 L)
    const chevrons = svg.match(/<path d="M [^"]+ L [^"]+ L [^"]+" stroke="#222222"/g) ?? [];
    assert.equal(chevrons.length, 2);
});

test("mark equal_angle renders two arcs", () => {
    const svg = renderSVG(compile(`
A = (0, 3)
B = (0, 0)
C = (3, 0)
D = (6, 3)
E = (6, 0)
F = (9, 0)
mark equal_angle(A, B, C, D, E, F)
`));
    const arcs = svg.match(/A 10 10 0 0 [01]/g) ?? [];
    assert.equal(arcs.length, 2);
});

test("labels: custom text form", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
label A "vertex"
`));
    assert.match(svg, />vertex<\/text>/);
    assert.match(svg, /font-family="serif"/);
    assert.match(svg, /font-style="italic"/);
    assert.match(svg, /font-size="14"/);
});

test("labels: custom offset form", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
label A offset (20, -10)
`));
    // point (0,0) maps into canvas; text shifted by (20, -10) relative to default
    const m = svg.match(/<text x="([^"]+)" y="([^"]+)"/);
    assert.ok(m);
    const base = renderSVG(compile("A = (0, 0)\nlabel A"));
    const mb = base.match(/<text x="([^"]+)" y="([^"]+)"/);
    assert.ok(Math.abs(Number(m[1]) - (Number(mb[1]) + 12)) < 1e-9); // 20 - 8
    assert.ok(Math.abs(Number(m[2]) - (Number(mb[2]) - 2)) < 1e-9); // -10 - (-8)
});

test("labels: default offset is (8, -8) (§37)", () => {
    const doc = compile("A = (0, 0)\nlabel A");
    assert.deepEqual(doc.labels[0].offset, { x: 8, y: -8 });
});

test("labels: multi-target renders one text per point with shared offset", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (4, 0)
C = (0, 3)
label A, B, C offset (0, 0)
`));
    const texts = svg.match(/>[A-Z]<\/text>/g) ?? [];
    assert.equal(texts.length, 3);
    // all three text nodes share the custom offset (0,0); points differ so positions differ
    const positions = [...svg.matchAll(/<text x="([^"]+)" y="([^"]+)"/g)].map((m) => `${m[1]},${m[2]}`);
    assert.equal(positions.length, 3);
    assert.equal(new Set(positions).size, 3); // distinct screen positions
});

test("labels: multi-target with shared text renders same label text", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (4, 0)
label A, B "vertex"
`));
    const texts = svg.match(/>vertex<\/text>/g) ?? [];
    assert.equal(texts.length, 2);
});

test("canvas: padding/width/height are honored", () => {
    const svg = renderSVG(compile(`
canvas { width: 800 height: 600 padding: 50 }
A = (0, 0)
`));
    assert.match(svg, /width="800" height="600" viewBox="0 0 800 600"/);
});

test("canvas: CLI-style overrides via compile options (§66)", () => {
    const doc = compile("A = (0, 0)", { width: 1200, height: 800, padding: 50 });
    const svg = renderSVG(doc);
    assert.match(svg, /width="1200" height="800"/);
});

test("style: dash array reaches stroke-dasharray", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (4, 0)
style segment { dash: 4 2 }
AB
`));
    assert.match(svg, /stroke-dasharray="4 2"/);
});

test("style: cap and join enums", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (4, 0)
style segment { cap: round join: bevel }
AB
`));
    assert.match(svg, /stroke-linecap="round"/);
    assert.match(svg, /stroke-linejoin="bevel"/);
});

test("style: fill #222222 for points by default (§35.1)", () => {
    const svg = renderSVG(compile("A = (0, 0)"));
    assert.match(svg, /<circle [^>]*r="4"[^>]*fill="#222222"/);
});

test("style: opacity is emitted", () => {
    const svg = renderSVG(compile(`
O = (0, 0)
style circle { opacity: 0.5 }
c = circle(O, 1)
`));
    assert.match(svg, /opacity="0\.5"/);
});

test("labels: duplicate targets merge, later wins (D3)", () => {
    const doc = compile(`
A = (0, 0)
label A
label A "renamed"
`);
    assert.equal(doc.labels.length, 1);
    assert.equal(doc.labels[0].text, "renamed");
    assert.deepEqual(doc.labels[0].offset, { x: 8, y: -8 });
});
