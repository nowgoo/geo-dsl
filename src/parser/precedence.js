/**
 * Operator precedence for the Pratt parser (spec §11.1, §13).
 *
 * Binding power, highest first:
 *   ^            right associative
 *   - (unary)    prefix
 *   * /          left associative
 *   + -          left associative
 */

export const PRECEDENCE = {
    "^": 5,
    "unary": 4,
    "*": 3,
    "/": 3,
    "+": 2,
    "-": 2,
};

export function binaryPrecedence(op) {
    return PRECEDENCE[op] ?? 0;
}
