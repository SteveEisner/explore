/**
 * Incrementally extract the `spec` string value from a streaming tool-call
 * input. The CLI streams tool arguments as partial JSON text (e.g.
 * `{"spec": "root = St` …), and we want to forward the decoded spec to the
 * front end token by token, before the JSON is complete.
 */
export function extractSpecSoFar(rawJson: string): string {
  const key = rawJson.indexOf('"spec"');
  if (key === -1) return "";
  const colon = rawJson.indexOf(":", key + 6);
  if (colon === -1) return "";
  const open = rawJson.indexOf('"', colon + 1);
  if (open === -1) return "";

  let out = "";
  let i = open + 1;
  while (i < rawJson.length) {
    const ch = rawJson[i];
    if (ch === '"') break; // closing quote — value complete
    if (ch !== "\\") {
      out += ch;
      i += 1;
      continue;
    }
    // Escape sequence; if truncated mid-escape, stop and wait for more input.
    const esc = rawJson[i + 1];
    if (esc === undefined) break;
    if (esc === "u") {
      const hex = rawJson.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 6;
      continue;
    }
    const simple: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    out += simple[esc] ?? esc;
    i += 2;
  }
  return out;
}
