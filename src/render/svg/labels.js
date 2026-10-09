/**
 * Label rendering (spec §37, §42): XML-escaped text, screen-space offset,
 * italic serif by default (§35.1).
 */

import { fmt, escapeXML } from "./format.js";
import { toScreen } from "./geometry.js";

export function renderLabel(transform, label, style) {
    const s = toScreen(transform, { x: label.resolved.x, y: label.resolved.y });
    const x = s.x + label.resolved.offset.x;
    const y = s.y + label.resolved.offset.y;
    const attrs = [
        `x="${fmt(x)}"`,
        `y="${fmt(y)}"`,
        `font-family="${style.font}"`,
        `font-style="${style.font_style}"`,
        `font-size="${fmt(style.font_size)}"`,
        `fill="${style.label_color}"`,
    ];
    return `<text ${attrs.join(" ")}>${escapeXML(label.resolved.text)}</text>`;
}
