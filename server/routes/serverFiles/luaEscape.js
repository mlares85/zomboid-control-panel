// Escape strings for safe interpolation into Lua source code
export function escapeLuaString(str) {
  return String(str).replace(/[\\"'\n\r\t\0\[\]]/g, (c) => {
    const escapes = {
      "\\": "\\\\",
      '"': '\\"',
      "'": "\\'",
      "\n": "\\n",
      "\r": "\\r",
      "\t": "\\t",
      "\0": "\\0",
      "[": "\\[",
      "]": "\\]",
    };
    return escapes[c] || c;
  });
}

const LUA_UNESCAPES = {
  "\\": "\\",
  '"': '"',
  "'": "'",
  n: "\n",
  r: "\r",
  t: "\t",
  0: "\0",
  "[": "[",
  "]": "]",
};

// Inverse of escapeLuaString. Parsing must undo what writing escaped, otherwise
// every save re-escapes the same backslashes and doubles them until the file is
// corrupt (seen in the wild: StreetlightGen.ExcludeSprites grew to 16k slashes).
export function unescapeLuaString(value) {
  const str = String(value);
  if (!/^"[\s\S]*"$|^'[\s\S]*'$/.test(str)) {
    return str.replace(/^["']|["']$/g, "");
  }
  return str
    .slice(1, -1)
    .replace(/\\([\s\S])/g, (match, c) =>
      Object.prototype.hasOwnProperty.call(LUA_UNESCAPES, c)
        ? LUA_UNESCAPES[c]
        : match,
    );
}
