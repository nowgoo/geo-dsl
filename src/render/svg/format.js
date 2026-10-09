/**
 * Deterministic number formatting (spec §43, plan D6).
 */

export function fmt(n) {
    if (!Number.isFinite(n)) return "0";
    let s = n.toFixed(6);
    if (s.includes(".")) {
        s = s.replace(/0+$/, "").replace(/\.$/, "");
    }
    if (s === "-0") s = "0";
    return s;
}

export function escapeXML(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
