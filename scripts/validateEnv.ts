import { validateClientEnvironment, validateServerEnvironment } from "../server/env";

const server = validateServerEnvironment();
validateClientEnvironment();

console.log(`Environment validation passed. Auth mode: ${server.authMode}.`);
if (server.warnings.length > 0) {
  console.log(`Warnings: ${server.warnings.length}`);
}
