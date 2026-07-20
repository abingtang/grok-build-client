import assert from "node:assert/strict";
import fs from "node:fs";

const registry = fs.readFileSync("electron/services/slash-commands.ts", "utf8");
const main = fs.readFileSync("electron/main.ts", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");

const commandBlocks = [...registry.matchAll(/^  \{\n([\s\S]*?)^  \},?$/gm)].map(
  (match) => match[1],
);
const clientCommands = commandBlocks
  .filter((block) => /kind:\s*"client"/.test(block))
  .map((block) => block.match(/name:\s*"([^"]+)"/)?.[1])
  .filter(Boolean);
const mainCases = new Set([...main.matchAll(/case\s+"([^"]+)"/g)].map((match) => match[1]));
const missingMainHandlers = clientCommands.filter((name) => !mainCases.has(name));

const applySlash = app.slice(
  app.indexOf("async function applySlashResult"),
  app.indexOf("async function onInputChange"),
);
const runSlash = app.slice(
  app.indexOf("async function runSlashCommand"),
  app.indexOf("async function applyRewind"),
);
const rendererCases = new Set([...applySlash.matchAll(/case\s+"([^"]+)"/g)].map((match) => match[1]));
const returnedActions = new Set([...main.matchAll(/action:\s*"([^"]+)"/g)].map((match) => match[1]));
const mainOnlyActions = new Set(["error", "quit", "system-message"]);
const missingRendererHandlers = [...returnedActions].filter(
  (action) => !mainOnlyActions.has(action) && !rendererCases.has(action),
);

assert.deepEqual(missingMainHandlers, [], `Client commands without main handlers: ${missingMainHandlers.join(", ")}`);
assert.deepEqual(missingRendererHandlers, [], `Actions without renderer handlers: ${missingRendererHandlers.join(", ")}`);
assert.match(app, /if \(exact && !selected\.argsRequired\)/, "Exact no-argument slash commands must execute on Enter");
assert.match(runSlash, /grokDesktop\.slash\.execute/, "All slash entry points must use the desktop dispatcher");
assert.doesNotMatch(runSlash, /grokDesktop\.acp\.prompt/, "Slash entry points must not bypass the desktop dispatcher");

console.log(`Slash commands OK: ${clientCommands.length} client commands, ${returnedActions.size} actions.`);
