const assert = require("node:assert/strict");
const test = require("node:test");

const { getGrokBinaryCandidates, grokBinaryFallback } = require("../dist-electron/env.js");

test("Windows resolves native Grok CLI executable names", () => {
  const home = "C:\\Users\\tester";
  const grokHome = `${home}\\.grok`;

  assert.deepEqual(getGrokBinaryCandidates("win32", home, grokHome), [
    `${grokHome}\\bin\\grok.exe`,
    `${grokHome}\\bin\\grok.cmd`,
  ]);
  assert.equal(grokBinaryFallback("win32"), "grok.exe");
});
