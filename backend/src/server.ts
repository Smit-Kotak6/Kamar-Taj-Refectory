import "dotenv/config";
import { app } from "./app.js";
import { prisma } from "./db.js";
const port = Number(process.env.PORT ?? "5000");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
const server = app.listen(port, () => console.log(`Kamar-Taj API listening on ${port}`));
server.on("error", error => { console.error(error); process.exitCode = 1; });
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  server.close(() => {
    void prisma.$disconnect().then(() => { clearTimeout(timer); process.exit(0); }, () => process.exit(1));
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
