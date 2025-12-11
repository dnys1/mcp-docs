import { startServer } from "./server.js";

startServer().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
