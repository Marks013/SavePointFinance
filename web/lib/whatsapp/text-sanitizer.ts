const assistantEncodingFixes: Array<[string, string]> = [
  ["\u00e2\u02dc\u20ac\u00ef\u00b8\u008f", "\u2600\ufe0f"],
  ["\u00f0\u0178\u0152\u00a4\u00ef\u00b8\u008f", "\ud83c\udf24\ufe0f"],
  ["\u00f0\u0178\u0152\u2122", "\ud83c\udf19"],
  ["\u00f0\u0178\u00a4\u201d", "\ud83e\udd14"],
  ["\u00f0\u0178\u201d\u2019", "\ud83d\udd12"],
  ["\u00e2\u0161\u00a0\u00ef\u00b8\u008f", "\u26a0\ufe0f"],
  ["\u00e2\u0161\u00ef\u00b8\u008f", "\u26a0\ufe0f"],
  ["N\u00c3\u00a3o", "N\u00e3o"],
  ["n\u00c3\u00a3o", "n\u00e3o"],
  ["n\u00c3\u00bamero", "n\u00famero"],
  ["poss\u00c3\u00advel", "poss\u00edvel"],
  ["est\u00c3\u00a1", "est\u00e1"],
  ["voc\u00c3\u00aa", "voc\u00ea"],
  ["licen\u00c3\u00a7a", "licen\u00e7a"],
  ["lan\u00c3\u00a7ar", "lan\u00e7ar"],
  ["relat\u00c3\u00b3rio", "relat\u00f3rio"],
  ["Configura\u00c3\u00a7\u00c3\u00b5es", "Configura\u00e7\u00f5es"]
];

export function sanitizeAssistantText(value: string) {
  let current = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!/(?:\u00c3\u0192.|\u00c3\u201a.|\u00c3\u00a2.|\u00c3\u00b0.|\u00c3\u00af.)/.test(current)) {
      break;
    }

    const decoded = Buffer.from(current, "latin1").toString("utf8");
    if (decoded.includes("\uFFFD") || decoded === current) {
      break;
    }

    current = decoded;
  }

  return assistantEncodingFixes.reduce((result, [search, replacement]) => {
    return result.split(search).join(replacement);
  }, current);
}
