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
export { renderSVG, renderInnerSVG, DEFAULT_RUNTIME_URL } from "./render/svg/renderer.js";
export { evaluate } from "./engine/evaluate.js";
export { layout, toWorld } from "./layout/viewport.js";
export { toScreen } from "./render/svg/geometry.js";

// v0.3 interactive SVG (spec_v0.3 §6)
export { serializeDocument, documentToPayload, documentFromPayload } from "./ir/serialize.js";
export {
    createInteractiveDocument,
    hitTest,
    createSession,
} from "./interactive/core.js";
export { mount, mountAll } from "./interactive/runtime.js";

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
