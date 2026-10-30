import express from "express";
import type { ErrorRequestHandler } from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { authRouter } from "./auth.js";
import { mealsRouter } from "./meals.js";
import { qrRouter } from "./qrRoutes.js";
import { staffRouter } from "./staffRoutes.js";
import { leaveRouter } from "./leaveRoutes.js";
import { studentAccountRouter } from "./studentAccountRoutes.js";
import { studentBillingRouter } from "./studentBillingRoutes.js";
import { adminScheduleRouter } from "./adminScheduleRoutes.js";
import { adminMembershipRouter } from "./adminMembershipRoutes.js";
import { adminOverviewRouter } from "./adminOverviewRoutes.js";
import { adminRateRouter } from "./adminRateRoutes.js";
import { adminWasteRouter } from "./adminWasteRoutes.js";
import { adminMenuRouter } from "./adminMenuRoutes.js";
import { prisma } from "./db.js";

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", serverNow: new Date().toISOString() }));
app.get("/api/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ code: "DATABASE_UNAVAILABLE", message: "Database is not ready" });
  }
});
app.use("/api/auth", authRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/qr", qrRouter);
app.use("/api/staff", staffRouter);
app.use("/api/leaves", leaveRouter);
app.use("/api/student", studentAccountRouter);
app.use("/api/student", studentBillingRouter);
app.use("/api/admin", adminScheduleRouter);
app.use("/api/admin", adminMembershipRouter);
app.use("/api/admin", adminOverviewRouter);
app.use("/api/admin", adminRateRouter);
app.use("/api/admin", adminWasteRouter);
app.use("/api/admin", adminMenuRouter);
app.use("/api", (_req, res) => res.status(404).json({ code: "NOT_FOUND", message: "Route not found" }));

// In production, serve the Vite build on the same origin as the API.
// Compiled location: backend/dist/src/app.js -> project/frontend/dist/.
if (process.env.NODE_ENV === "production") {
  const frontendDist = fileURLToPath(new URL("../../../frontend/dist/", import.meta.url));
  const indexHtml = fileURLToPath(new URL("../../../frontend/dist/index.html", import.meta.url));
  if (!existsSync(indexHtml)) throw new Error("Frontend build missing: build frontend before starting the production server");
  app.use(express.static(frontendDist));
  app.get("/{*path}", (_req, res) => res.sendFile(indexHtml));
}
app.use((_req, res) => res.status(404).json({ code: "NOT_FOUND", message: "Route not found" }));
const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Invalid JSON body" });
    return;
  }
  console.error("Request failed:", error instanceof Error ? error.name : "UnknownError");
  res.status(500).json({ code: "INTERNAL_ERROR", message: "Request failed" });
};
app.use(errorHandler);
