import { test } from "node:test";
import assert from "node:assert/strict";

import { compile, renderSVG } from "../src/index.js";

test("smoke: full pipeline triangle -> valid SVG", () => {
    const source = `
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
`;
    const document = compile(source);
    const svg = renderSVG(document);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<\/svg>$/);
});
