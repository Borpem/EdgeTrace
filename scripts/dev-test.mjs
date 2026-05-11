process.env.AUTH_MODE = "mock";
process.env.VITE_AUTH_MODE = "mock";

await import("./dev.mjs");
