/**
 * Public API (spec §46, §71).
 *
 * Layered:   lex -> parse -> analyze -> compile -> renderSVG
 * Convenience: compile(source) returns a laid-out Document.
 */

export { lex } from "./lexer/lexer.js";
export { parse } from "./parser/parser.js";
export { analyze } from "./semantic/analyzer.js";
export { compile } from "./compiler.js";
export { renderSVG } from "./render/svg/renderer.js";
export { evaluate } from "./engine/evaluate.js";
export { layout } from "./layout/viewport.js";

export {
    GeometryDSLError,
    SyntaxErrorDSLError,
    NameErrorDSLError,
    TypeErrorDSLError,
    ArgumentErrorDSLError,
    GeometryErrorDSLError,
    DependencyErrorDSLError,
    ConstraintErrorDSLError,
    formatError,
} from "./errors.js";
