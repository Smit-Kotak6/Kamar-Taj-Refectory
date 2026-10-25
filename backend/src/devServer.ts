/** Standalone test server.  Run:  npx tsx src/devServer.ts
 *  Later: mount `router` and `scheduleRouter` inside the team's real app. */
import "dotenv/config";
import express from "express";
import { setServiceWindowProvider } from "./qrRedemption";
import { devAuth, router } from "./routes";
import { scheduleRouter, serviceWindow, TZ } from "./mealSchedule";

// QR validity now comes from the real meal schedule (defaults + overrides)
setServiceWindowProvider(serviceWindow);

const app = express();
app.use(express.json());
app.use(devAuth);
app.use(router);
app.use(scheduleRouter);

const port = Number(process.env.PORT ?? 4001);
app.listen(port, () => console.log(`Dev server on http://localhost:${port}  (institute timezone: ${TZ})`));
