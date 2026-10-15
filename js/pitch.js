// Tokyo pitch-accent marks, shared by the Words tab and the Review tab. Each kana gets a
// line over it when high and a tick where the pitch drops; a circled number names the accent.
export const CIRCLED = "⓪①②③④⑤⑥⑦⑧⑨";

// Which morae are high in Tokyo pitch accent: 0 = low-high-high…, 1 = high-low-low…,
// n ≥ 2 = low, high up to mora n, then low.
export const isHigh = (i, accent) => accent === 0 ? i > 0 : accent === 1 ? i === 0 : i > 0 && i < accent;

// Pitch is counted in morae: small ゃゅょ and small vowels join the kana before them, while
// っ, ー and ん are morae of their own.
const JOINS_PREVIOUS = new Set("ゃゅょぁぃぅぇぉャュョァィゥェォ");
export function morae(text) {
  const out = [];
  for (const ch of [...text.normalize("NFC")]) {
    if (out.length && JOINS_PREVIOUS.has(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

export function accentTitle(kana, accent) {
  const n = morae(kana).length;
  const how = accent === 0 ? "flat: starts low, rises, never drops"
    : accent === n ? "rises, drops right after the word (on a following particle)"
    : `pitch drops after mora ${accent}`;
  return `Pitch accent ${accent}: ${how}. ${n} mora${n > 1 ? "e" : ""}.`;
}

// The i-th kana of a word; `inner` is its (already safe) HTML.
export function moraHtml(inner, i, accent) {
  const cls = (isHigh(i, accent) ? " hi" : "") + (i === accent - 1 ? " drop" : "");
  return `<span class="m${cls}">${inner}</span>`;
}

// The circled accent number, with an explanation on hover.
export const accentMarkHtml = (kana, accent) =>
  `<span class="acc" title="${accentTitle(kana, accent)}">${CIRCLED[accent]}</span>`;
