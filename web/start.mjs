import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const wrangler = createRequire(import.meta.url).resolve("wrangler/bin/wrangler.js");
const port = process.env.PORT ?? "8080";
const vars = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "DECK_URL"].flatMap(
  (key) => {
    const value = process.env[key];
    return value ? ["--var", `${key}:${value}`] : [];
  },
);

const child = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--ip",
    "0.0.0.0",
    "--port",
    port,
    "--inspector-port",
    "0",
    ...vars,
  ],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
