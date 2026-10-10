/**
 * Payload serialization tests (spec_v0.3 §4, plan M1).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, evaluate, layout } from "../../src/index.js";
import {
    documentToPayload,
    documentFromPayload,
    serializeDocument,
    PAYLOAD_VERSION,
} from "../../src/ir/serialize.js";

function roundTrip(source) {
    const document = compile(source);
    const payload = documentToPayload(document);
    const restored = documentFromPayload(payload);
    evaluate(restored);
    return { document, payload, restored };
}

test("payload version + frozen key order", () => {
    const payload = documentToPayload(compile("A = (0,0)\nB = (4,0)\nAB"));
    assert.equal(payload.version, PAYLOAD_VERSION);
    assert.deepEqual(
        Object.keys(payload),
        ["version", "mode", "canvas", "transform", "objects", "styles", "labels", "marks", "constraints"],
    );
});

test("serializeDocument is deterministic (byte-identical double render)", () => {
    const source = "A = (0,0)\nB = (6,0)\nC = (2,4)\nABC\nD = mid(BC)\nE = mid(CA)\nG = AD * BE\nlabel A\nlabel G";
    assert.equal(serializeDocument(compile(source)), serializeDocument(compile(source)));
});

test("serializeDocument escapes < for script embedding", () => {
    const json = serializeDocument(compile('A = (0,0)\nB = (4,0)\nAB\nlabel A "<x>"'));
    assert.ok(!json.includes("</"));
    assert.ok(json.includes("\\u003c"));
});

test("round-trip: literal document evaluates to identical geometry", () => {
    const source = "A = (0,0)\nB = (6,0)\nC = (2,4)\nABC\nD = mid(BC)\nE = mid(CA)\nG = AD * BE";
    const { document, restored } = roundTrip(source);
    for (const [name, object] of document.objects) {
        const other = restored.objects.get(name);
        assert.ok(other, `missing object ${name}`);
        assert.deepEqual(
            { ...other.geometry },
            { ...object.geometry },
            `geometry mismatch for ${name}`,
        );
    }
});

test("round-trip preserves definitions and dependencies", () => {
    const source = "A = (0,0)\nB = (6,0)\nC = (2,4)\nABC\nD = mid(BC)\nE = mid(CA)\nG = AD * BE";
    const { document, restored } = roundTrip(source);
    const d0 = document.objects.get("D");
    const d1 = restored.objects.get("D");
    assert.equal(d1.definition.type, "MidpointDefinition");
    assert.deepEqual(d1.dependencies, d0.dependencies);
    const g0 = document.objects.get("G");
    const g1 = restored.objects.get("G");
    assert.equal(g1.definition.type, "IntersectionDefinition");
    assert.deepEqual(g1.dependencies, g0.dependencies);
});

test("round-trip preserves styles, labels, marks", () => {
    const source = [
        "A = (0,0)",
        "B = (6,0)",
        "C = (2,4)",
        "style AB {\n    stroke: #f00\n    width: 3\n}",
        "AB",
        "label A \"vertex\"",
        "mark right_angle(A, B, C)",
    ].join("\n");
    const { restored } = roundTrip(source);
    const blocks = restored.styles.get("AB");
    assert.ok(blocks, "style AB missing");
    assert.equal(blocks[0].properties.get("stroke"), "#f00");
    const label = restored.labels[0];
    assert.equal(label.target.name, "A");
    assert.equal(label.text, "vertex");
    const mark = restored.marks[0];
    assert.equal(mark.kind, "right_angle");
    assert.equal(mark.args.length, 3);
});

test("round-trip: labels and marks resolve after re-evaluation", () => {
    const source = "A = (0,0)\nB = (6,0)\nC = (2,4)\nABC\nD = mid(BC)\nlabel D\nmark equal_length(BD, DC)";
    const { document, restored } = roundTrip(source);
    assert.ok(restored.labels[0].resolved, "label not resolved");
    assert.deepEqual(
        { ...restored.labels[0].resolved },
        { ...document.labels[0].resolved },
    );
    assert.ok(restored.marks[0].resolved, "mark not resolved");
});

test("payload strips positions (no line/column/offset leak)", () => {
    const payload = documentToPayload(compile("A = (0,0)\nB = (4,0)\nAB\nD = mid(AB)"));
    const text = JSON.stringify(payload);
    assert.ok(!text.includes('"position"'), "position leaked into payload");
    assert.ok(!text.includes('"line"'), "line leaked into payload");
});

test("draggable flags: literal points true, derived false", () => {
    const payload = documentToPayload(
        compile("A = (0,0)\nB = (6,0)\nC = (2,4)\nD = mid(BC)\nE = mid(CA)\nG = AD * BE"),
    );
    const byName = Object.fromEntries(payload.objects.map((o) => [o.name, o]));
    assert.equal(byName.A.draggable, true);
    assert.equal(byName.B.draggable, true);
    assert.equal(byName.D.draggable, false);
    assert.equal(byName.G.draggable, false);
});

test("mode: free / assert / solve", () => {
    assert.equal(documentToPayload(compile("A = (0,0)\nB = (4,0)\nAB")).mode, "free");
    assert.equal(documentToPayload(compile("A = (0,0)\nB = (4,0)\nC = (2,3)\nD = (6,3)\nAB // CD")).mode, "assert");
    const solved = compile("A = (0,0)\nB = (4,0)\nC = ?\nAC = 3\nBC = 2");
    assert.equal(documentToPayload(solved).mode, "solve");
});

test("solved unknown points carry snapshot coordinates", () => {
    const payload = documentToPayload(
        compile("A = (0,0)\nB = (4,0)\nC = ?\nAC = 3\nBC = 2"),
    );
    const c = payload.objects.find((o) => o.name === "C");
    assert.equal(c.unknown, true);
    assert.ok(Array.isArray(c.solved) && c.solved.length === 2, "solved coords missing");
    assert.equal(c.draggable, true);
});

test("round-trip: solved document re-evaluates identically", () => {
    const source = "A = (0,0)\nB = (4,0)\nC = ?\nAC = 3\nBC = 2";
    const { document, restored } = roundTrip(source);
    assert.deepEqual(
        { ...restored.objects.get("C").geometry },
        { ...document.objects.get("C").geometry },
    );
});

test("layout() works on rehydrated document (transform re-derivable)", () => {
    const source = "A = (0,0)\nB = (6,0)\nC = (2,4)\nABC";
    const { document, restored } = roundTrip(source);
    layout(restored);
    assert.deepEqual(restored.transform, document.transform);
});

test("version mismatch throws", () => {
    assert.throws(() => documentFromPayload({ version: 999 }), /version mismatch/);
    assert.throws(() => documentFromPayload(null), /version mismatch/);
});

test("serializeDocument without layout throws", async () => {
    const { analyze } = await import("../../src/index.js");
    const document = analyze((await import("../../src/parser/parser.js"))
        .parse((await import("../../src/lexer/lexer.js")).lex("A = (0,0)")));
    assert.throws(() => serializeDocument(document), /no layout/);
});
