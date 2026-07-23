/**
 * Smoke tests for ACP client capability handlers (fs + terminal).
 * Run: node --test electron/acp/client-capabilities.test.cjs
 * (requires tsc -p tsconfig.electron.json first)
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Compiled outputs land in dist-electron/acp/*
const root = path.join(__dirname, "..", "..", "dist-electron", "acp");
const { handleReadTextFile, handleWriteTextFile } = require(
  path.join(root, "fs-handlers.js"),
);
const { TerminalHost, RpcHandlerError } = require(
  path.join(root, "terminal-host.js"),
);

describe("fs handlers", () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gbd-fs-"));
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("write + read roundtrip", async () => {
    const file = path.join(dir, "nested", "ok.txt");
    await handleWriteTextFile({
      path: file,
      content: "line1\nline2\nline3\n",
    });
    const full = await handleReadTextFile({ path: file });
    assert.equal(full.content, "line1\nline2\nline3\n");

    const slice = await handleReadTextFile({ path: file, line: 2, limit: 1 });
    assert.equal(slice.content, "line2");

    const empty = await handleReadTextFile({ path: file, limit: 0 });
    assert.equal(empty.content, "");
  });

  test("missing file → resource not found", async () => {
    await assert.rejects(
      () => handleReadTextFile({ path: path.join(dir, "nope.txt") }),
      (err) => err instanceof RpcHandlerError && err.code === -32002,
    );
  });
});

describe("terminal host", () => {
  test("create → wait → output for echo", async () => {
    const host = new TerminalHost();
    const { terminalId } = host.create({
      sessionId: "s1",
      command: 'echo "Desktop client ↔ Grok Build 通信正常"',
    });
    assert.ok(terminalId);

    const status = await host.waitForExit(terminalId);
    assert.equal(status.exitCode, 0);

    const snap = host.output(terminalId);
    assert.match(snap.output, /Desktop client/);
    assert.equal(snap.truncated, false);
    assert.equal(snap.exitStatus?.exitCode, 0);

    host.release(terminalId);
  });
});
