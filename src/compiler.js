/**
 * Compiler pipeline (spec §47, spec_v0.2 §4): source -> lexed -> parsed ->
 * analyzed -> IR -> (assertion check | solve) -> evaluated -> laid out.
 * Returned document renders directly.
 */

import { lex } from "./lexer/lexer.js";
import { parse } from "./parser/parser.js";
import { analyze } from "./semantic/analyzer.js";
import { evaluate } from "./engine/evaluate.js";
import { checkConstraints } from "./engine/constraints.js";
import { solveConstraints } from "./solver/solve.js";
import { layout } from "./layout/viewport.js";
import { ArgumentErrorDSLError } from "./errors.js";

export function compile(source, options = {}) {
    const tokens = lex(source);
    const ast = parse(tokens);
    const document = analyze(ast);

    if (document.unknowns.size > 0) {
        // solver mode (spec_v0.2 §4.2): assertions are enforced by the solver's
        // acceptance criterion, using the same predicate module
        solveConstraints(document);
    } else {
        // assertion mode (spec_v0.2 §4.1): evaluate everything, then check
        evaluate(document);
        checkConstraints(document);
    }
    applyCanvasOverrides(document, options);
    layout(document);

    return document;
}

/** CLI --width/--height/--padding override DSL canvas (spec §66) */
function applyCanvasOverrides(document, options) {
    for (const key of ["width", "height", "padding"]) {
        const value = options[key];
        if (value === undefined) continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            throw new ArgumentErrorDSLError(`invalid --${key} value: ${value}`);
        }
        document.canvas[key] = value;
        document.canvas.explicit.add(key);
    }
}
