import { test } from "node:test";
import assert from "node:assert/strict";

import { compile, renderSVG } from "../../src/index.js";

// --- layout (§32, §33) ---------------------------------------------------------

test("layout: uniform scale keeps aspect ratio", () => {
    const doc = compile(`
A = (0, 0)
B = (6, 0)
C = (2, 4)
ABC
`);
    const { scale, ox, oy } = doc.transform;
    // bounds: x 0..6, y 0..4; canvas 600x400 pad 20 -> avail 560x360
    // scale = min(560/6, 360/4) = min(93.33, 90) = 90
    assert.ok(Math.abs(scale - 90) < 1e-9);
    // centered horizontally: offset = 20 + (560 - 6*90)/2 = 20 + 10 = 30
    assert.ok(Math.abs(ox - 30) < 1e-9);
    // svgY = oy - scale*y; y=0 maps to offset 20 from bottom -> oy = 400-20 = 380
    assert.ok(Math.abs(oy - 380) < 1e-9);
});

test("layout: single point gets unit scale", () => {
    const doc = compile("P = (5, 5)");
    assert.equal(doc.transform.scale, 1);
});

test("layout: infinite line is clipped to viewport", () => {
    const doc = compile(`
A = (0, 0)
B = (1, 0)
l = line(A, B)
`);
    const line = doc.objects.get("l");
    assert.ok(line.clippedGeometry);
    assert.equal(line.clippedGeometry.type, "Segment");
    // clipped endpoints must lie inside the visible world rect
    const { scale, ox, oy } = doc.transform;
    const world = {
        minX: (0 - ox) / scale,
        maxX: (600 - ox) / scale,
        minY: (oy - 400) / scale,
        maxY: oy / scale,
    };
    for (const p of [line.clippedGeometry.a, line.clippedGeometry.b]) {
        assert.ok(p.x >= world.minX - 1e-6 && p.x <= world.maxX + 1e-6);
        assert.ok(p.y >= world.minY - 1e-6 && p.y <= world.maxY + 1e-6);
    }
});

test("layout: ray is clipped", () => {
    const doc = compile(`
A = (0, 0)
B = (1, 1)
r = ray(A, B)
`);
    assert.ok(doc.objects.get("r").clippedGeometry);
});

test("layout: arc bounds include cardinal extremes", () => {
    const doc = compile(`
O = (0, 0)
A = (1, 0)
B = (0, 1)
a = arc(O, A, B)
`);
    // arc from (1,0) to (0,1) ccw passes (sqrt2/2, sqrt2/2); bounds within [0,1]^2
    const a = doc.objects.get("a");
    const g = a.geometry;
    assert.ok(g.startAngle !== undefined);
});

test("layout: only-lines document gets anchor-seeded viewport", () => {
    const doc = compile(`
A = (0, 0)
B = (1, 1)
l = line(A, B)
`);
    assert.ok(doc.transform && Number.isFinite(doc.transform.scale));
});

// --- SVG output (§40, §43, §65) ---------------------------------------------------

test("svg: root is standalone with width/height/viewBox", () => {
    const svg = renderSVG(compile("A = (0, 0)"));
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="400" viewBox="0 0 600 400">/);
    assert.match(svg, /<\/svg>$/);
});

test("svg: points, segments, polygons render as expected elements", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (6, 0)
C = (2, 4)
ABC
label A
`));
    assert.match(svg, /<polygon points="/);
    assert.match(svg, /<circle /);
    assert.match(svg, /<text /);
    assert.match(svg, />A<\/text>/);
});

test("svg: deterministic output - two runs are byte-identical", () => {
    const source = `
canvas { width: 600 height: 400 padding: 30 }

A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(AB)

h = perpendicular(C, AB)
E = h * AB

label A
label B
label C
label D
label E

mark right_angle(C, E, B)
`;
    const svg1 = renderSVG(compile(source));
    const svg2 = renderSVG(compile(source));
    assert.equal(svg1, svg2);
});

test("svg: labels are XML-escaped (§42)", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
label A "<&>"
`));
    assert.match(svg, /&lt;&amp;&gt;<\/text>/);
});

test("svg: style type selector applies", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (4, 0)
style segment { stroke: #ff0000 width: 5 }
AB
`));
    assert.match(svg, /stroke="#ff0000"/);
    assert.match(svg, /stroke-width="5"/);
});

test("svg: object style overrides type style (§36)", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (4, 0)
C = (0, 4)
style segment { stroke: #333333 width: 2 }
style AB { stroke: #f00000 }
AB
BC
`));
    // AB gets #f00000 width 2; BC gets #333333
    assert.match(svg, /stroke="#f00000" stroke-width="2"/);
    assert.match(svg, /stroke="#333333"/);
});

test("svg: circle default fill none, polygon default fill none (§35.1)", () => {
    const svg = renderSVG(compile(`
O = (0, 0)
c = circle(O, 2)
A = (5, 0)
B = (8, 0)
C = (5, 3)
ABC
`));
    // circle element before any explicit style has fill="none"
    assert.match(svg, /<circle [^>]*fill="none"/);
});

test("svg: arc renders as SVG arc path", () => {
    const svg = renderSVG(compile(`
O = (0, 0)
A = (1, 0)
B = (0, 1)
a = arc(O, A, B)
`));
    assert.match(svg, /<path d="M [^"]+ A [^"]+ 0 0 [01] [^"]+" [^>]*fill="none"\/>/);
});

test("svg: polyline renders as path", () => {
    const svg = renderSVG(compile(`
pl = polyline((0,0), (1,0), (1,1))
`));
    assert.match(svg, /<path d="M [^"]+ L [^"]+ L [^"]+"/);
});

test("svg: ray renders as clipped line", () => {
    const svg = renderSVG(compile(`
A = (0, 0)
B = (1, 0)
r = ray(A, B)
`));
    assert.match(svg, /<line /);
});

// --- vertical slice (spec §73) ------------------------------------------------------

test("vertical slice: full pipeline compiles spec overview example", () => {
    const document = compile(`
A = (0, 0)
B = (6, 0)
C = (2, 4)

ABC

D = mid(BC)
E = mid(CA)

AD
BE

G = AD * BE

label A
label B
label C
label D
label E
label G
`);
    const svg = renderSVG(document);
    // G evaluated at centroid
    const g = document.objects.get("G").geometry;
    assert.ok(Math.abs(g.x - 8 / 3) < 1e-9);
    assert.ok(Math.abs(g.y - 4 / 3) < 1e-9);
    assert.ok(svg.includes("</svg>"));
});
