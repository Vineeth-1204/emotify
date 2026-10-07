/**
 * Emotify Plain-Text Sanitizer for Counselor & Admin Review Notes (EMOT-SEC-03)
 *
 * Enforces strict plain-text semantics for notes, reasons, and descriptions.
 * Neutralizes HTML, SVG, script blocks, executable pseudo-protocols, and inline event handlers,
 * while strictly preserving normal clinical notation (e.g. "< 10", "> 50", "<= 2.5").
 */

export function sanitizePlainText(input: string | undefined | null): string {
  if (input === undefined || input === null) return "";
  let text = String(input);

  // 1. Remove executable container tags and their inner content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  text = text.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "");
  text = text.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "");

  // 2. Strip any remaining HTML/SVG tags (open, close, self-closing)
  // Requires tag name to start with ASCII letter, so "< 10" or "<= 5" are preserved
  text = text.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^>]*?)?\/?>/g, "");

  // 3. Neutralize scriptable pseudo-protocols
  text = text.replace(/\bjavascript\s*:/gi, "disarmed-js:");
  text = text.replace(/\bvbscript\s*:/gi, "disarmed-vbs:");
  text = text.replace(/\bdata\s*:\s*text\/html/gi, "disarmed-data:");

  // 4. Neutralize any stray event handler attributes (e.g. onload=, onerror=, onclick=)
  text = text.replace(/\bon[a-zA-Z]+\s*=/gi, "blocked-handler=");

  return text.trim();
}
