import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  AUTH_MODE: "mock",
  VITE_AUTH_MODE: "mock",
  VITE_DISABLE_ONBOARDING_OVERLAY: "1",
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: "",
  EDGETRACE_DB_PATH: process.env.EDGETRACE_E2E_DB_PATH ?? join(tmpdir(), "edgetrace-e2e.sqlite"),
  PORT: "4107",
  VITE_API_BASE_URL: "http://127.0.0.1:4107"
};

const shellCommand = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "sh";
const shellArgs = (command) => (process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command]);

const commands = [
  ["server", `${npmCommand} run dev:server`],
  ["web", `${npmCommand} run dev:web -- --host 127.0.0.1 --port 7174 --strictPort`]
];

const children = commands.map(([name, command]) => {
  const child = spawn(shellCommand, shellArgs(command), {
    env,
    stdio: "inherit",
    shell: false
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code ?? 1;
    }
  });

  return child;
});

const stop = () => {
  children.forEach((child) => child.kill());
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
