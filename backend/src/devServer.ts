/** Standalone test server so you don't have to touch teammates' server.js yet.
 *  Run:  npx tsx src/devServer.ts   (later: mount `router` inside the real app) */
import "dotenv/config";
import express from "express";
import { setServiceWindowProvider } from "./qrRedemption";
import { devAuth, router } from "./routes";

// DEV ONLY: pretend every meal's service window is open right now.
// Without this, redemption is correctly BLOCKED until a real schedule exists.
if (process.env.DEV_OPEN_WINDOWS === "1") {
  setServiceWindowProvider(async () => ({
    start: new Date(Date.now() - 3600_000),
    end: new Date(Date.now() + 3600_000),
  }));
  console.log("DEV_OPEN_WINDOWS=1 -> service windows faked as open");
}

const app = express();
app.use(express.json());
app.use(devAuth);
app.use(router);

const port = Number(process.env.PORT ?? 4001);
app.listen(port, () => console.log(`Dev server on http://localhost:${port}`));
