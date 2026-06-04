// Run the demo server: `node server.js` (after `npm run build`)
import { createServer } from "./dist/server.js";
createServer({ port: 8787 });
console.log("live-cursors server on ws://localhost:8787");
