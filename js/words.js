// Every example-word list in one place: hiragana (basic + voiced/combined) and katakana.
import { WORDS } from "./data.js";
import { VOICED_WORDS } from "./words-voiced.js";
import { KATA_WORDS } from "./words-katakana.js";

const HIRAGANA_WORDS = [...WORDS, ...VOICED_WORDS];
const EVERY_WORD = [...HIRAGANA_WORDS, ...KATA_WORDS];

export const wordsFor = script => (script === "kata" ? KATA_WORDS : HIRAGANA_WORDS);
export const findWord = kana => EVERY_WORD.find(w => w.kana === kana);
