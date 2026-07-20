import concurrently from "concurrently";

const port = process.env.VITE_PORT || "5175";
const url = `http://127.0.0.1:${port}`;

const { result } = concurrently(
  [
    { command: `vite --host 127.0.0.1 --port ${port}`, name: "vite" },
    {
      command: `wait-on ${url} && tsc -p tsconfig.electron.json && electron .`,
      name: "electron",
      env: { ELECTRON_DEV: "1", VITE_DEV_SERVER_URL: url },
    },
  ],
  { killOthers: ["failure", "success"], prefix: "name" },
);

try {
  await result;
} catch {
  process.exitCode = 1;
}
