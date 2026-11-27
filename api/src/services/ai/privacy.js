/**
 * Keeps internal data inside the company: before text goes to an outside AI,
 * phone numbers, IMSI / long ID numbers and e-mail addresses are replaced by
 * placeholders like [PHONE_1]; the answer gets the real values back here.
 */
const RULES = [
  { kind: 'EMAIL', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  // Lao mobile / fixed numbers: 20xxxxxxxx, 020xxxxxxxx, 85620xxxxxxxx, 030xxxxxxx, +856 …
  { kind: 'PHONE', re: /(?<![\w])(?:\+?856[\s-]?)?0?(?:20|30)[\s-]?\d{3,4}[\s-]?\d{3,4}(?![\w])/g },
  // IMSI (15 digits), ICCID, account / ID numbers: any run of 8+ digits.
  { kind: 'NUMBER', re: /(?<![\w])\d{8,22}(?![\w])/g },
];

/** A placeholder map shared by one question (and the history sent with it). */
export function createMasker() {
  const byValue = new Map();
  const byKey = new Map();
  const counts = {};
  const mask = (text) => {
    let out = String(text ?? '');
    for (const { kind, re } of RULES) {
      out = out.replace(re, (value) => {
        const clean = value.trim();
        if (!byValue.has(clean)) {
          counts[kind] = (counts[kind] ?? 0) + 1;
          const key = `[${kind}_${counts[kind]}]`;
          byValue.set(clean, key);
          byKey.set(key, clean);
        }
        return byValue.get(clean);
      });
    }
    return out;
  };
  const unmask = (text) => String(text ?? '').replace(/\[(EMAIL|PHONE|NUMBER)_\d+\]/g, (k) => byKey.get(k) ?? k);
  return { mask, unmask, values: byKey, get count() { return byKey.size; } };
}

/**
 * Streaming version of unmask: a placeholder may arrive split over two chunks
 * ("[PHO" + "NE_1]"), so a possibly unfinished "[…" is held back until complete.
 */
export function unmaskStream(masker, onText) {
  let held = '';
  return {
    push(chunk) {
      held += chunk;
      const open = held.lastIndexOf('[');
      let ready = held;
      if (open >= 0 && held.indexOf(']', open) < 0 && held.length - open <= 12) {
        ready = held.slice(0, open);
        held = held.slice(open);
      } else {
        held = '';
      }
      if (ready) onText(masker.unmask(ready));
    },
    flush() {
      if (held) onText(masker.unmask(held));
      held = '';
    },
  };
}
