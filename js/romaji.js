// Kana → romaji, one syllable at a time, so the reading aid can annotate only the
// syllables the learner hasn't met yet. Hepburn-style; long vowels are spelled out (ou, ii).
const BASE = {
  あ:"a",い:"i",う:"u",え:"e",お:"o", か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",
  さ:"sa",し:"shi",す:"su",せ:"se",そ:"so", た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",
  な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no", は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",
  ま:"ma",み:"mi",む:"mu",め:"me",も:"mo", や:"ya",ゆ:"yu",よ:"yo",
  ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro", わ:"wa",ゐ:"i",ゑ:"e",を:"wo",ん:"n",
  が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go", ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",
  だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do", ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",
  ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po", ゔ:"vu",
  ぁ:"a",ぃ:"i",ぅ:"u",ぇ:"e",ぉ:"o", ゃ:"ya",ゅ:"yu",ょ:"yo", ゎ:"wa", っ:"",
};
const SMALL_Y = "ゃゅょ", SMALLS = "ゃゅょぁぃぅぇぉ";
const isKatakana = ch => ch >= "ァ" && ch <= "ヶ";
const toHira = ch => (isKatakana(ch) ? String.fromCharCode(ch.charCodeAt(0) - 0x60) : ch);
const isKana = ch => toHira(ch) in BASE;
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = s => s.replace(/[&<>"']/g, c => ESC[c]);

function combine(first, small) {
  const base = BASE[first];
  if (SMALL_Y.includes(small)) {
    const stem = base.slice(0, -1);                            // き→k, し→sh, ち→ch, じ→j
    const v = BASE[small].slice(1);                            // ゃ→a
    return ["sh", "ch", "j"].includes(stem) ? stem + v : stem + "y" + v;
  }
  const v = BASE[small];
  if (base.endsWith(v)) return base + v;                            // ねぇ→nee, あぁ→aa, うぅ→uu
  const stem = base === "u" ? "w" : base === "i" ? "y" : base.replace(/[aiueo]$/, "");   // ファ→f+a, ウィ→w+i, イェ→y+e
  return stem + v;
}

// The kana syllable starting at chars[i]: one kana, plus a following small ゃゅょ/ぁぃぅぇぉ.
function syllableAt(chars, i) {
  const h = toHira(chars[i]), next = chars[i + 1] && toHira(chars[i + 1]);
  if (next && SMALLS.includes(next) && !SMALLS.includes(h)) return { len: 2, romaji: combine(h, next) };
  return { len: 1, romaji: BASE[h] };
}

// [{ text, romaji }] — romaji is null for anything that isn't kana. っ joins the syllable
// after it (doubling its consonant), and ー joins the syllable before it (repeating its vowel).
export function syllables(text) {
  const chars = [...text.normalize("NFC")], out = [];
  for (let i = 0; i < chars.length;) {
    const ch = chars[i];
    if (ch === "ー" && out.at(-1)?.romaji && out.at(-1).romaji !== "'") {
      const prev = out.at(-1);
      prev.text += ch;
      prev.romaji += prev.romaji.match(/[aiueo]$/)?.[0] ?? "";
      i++;
    } else if (!isKana(ch)) {
      out.push({ text: ch, romaji: null });
      i++;
    } else if (toHira(ch) === "っ" && chars[i + 1] && isKana(chars[i + 1]) && toHira(chars[i + 1]) !== "っ") {
      const s = syllableAt(chars, i + 1);
      const doubled = s.romaji.startsWith("ch") ? "t" : s.romaji[0];
      out.push({ text: chars.slice(i, i + 1 + s.len).join(""), romaji: doubled + s.romaji });
      i += 1 + s.len;
    } else {
      const s = syllableAt(chars, i);
      // An unpaired っ (end of text, or before a non-kana or another っ) is a glottal stop.
      // ん is always plain "n": ruby is per syllable, so きんえん → ki·n·e·n needs no apostrophe.
      out.push({ text: chars.slice(i, i + s.len).join(""), romaji: s.romaji || "'" });
      i += s.len;
    }
  }
  return out;
}

export const toRomaji = text => syllables(text).map(s => s.romaji ?? s.text).join("");

// HTML for `text` with <ruby> romaji over each syllable not made entirely of known kana.
export function rubyHtml(text, known) {
  return syllables(text).map(({ text: t, romaji }) =>
    romaji && ![...t].every(ch => known.has(ch))
      ? `<ruby>${escape(t)}<rt>${romaji}</rt></ruby>` : escape(t)).join("");
}
