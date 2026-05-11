import { spawn } from "node:child_process";

const commands = [
  ["server", "npm.cmd run dev:server"],
  ["web", "npm.cmd run dev:web"]
];

const children = commands.map(([name, command]) => {
  const child = spawn(command, {
    stdio: "inherit",
    shell: true
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
