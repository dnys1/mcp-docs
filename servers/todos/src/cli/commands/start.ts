import { startServer } from "../../server.js";

export async function startCommand(_args: string[]) {
  await startServer();
}
