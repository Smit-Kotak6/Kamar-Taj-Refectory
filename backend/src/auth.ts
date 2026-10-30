import { Router } from "express";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "./db.js";
import { hashPassword, verifyPassword, tokenHash } from "./password.js";

type User = { id: string; name: string; email: string; role: string };
const dummyHash = hashPassword(randomBytes(32).toString("hex"));
export const authenticate: RequestHandler = async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) { res.status(401).json({code:"UNAUTHORIZED", message:"Please log in"}); return; }
  const hash = tokenHash(token);
  const rows = await prisma.$queryRaw<User[]>`
    SELECT u."id",u."name",u."email",u."role" FROM "AuthSession" s
    JOIN "User" u ON u."id"=s."userId"
    WHERE s."tokenHash"=${hash} AND s."expiresAt">${new Date()}`;
  if (!rows[0]) { res.status(401).json({code:"UNAUTHORIZED",message:"Session expired. Please log in"}); return; }
  res.locals.user = rows[0]; res.locals.sessionHash = hash; next();
};
export const requireRole = (...roles: string[]): RequestHandler => (_req,res,next) => {
  const user = res.locals.user as User | undefined;
  if (!user) { res.status(401).json({code:"UNAUTHORIZED",message:"Please log in"}); return; }
  if (!roles.includes(user.role)) { res.status(403).json({code:"FORBIDDEN",message:"Access denied"}); return; }
  next();
};
export const authRouter = Router();
const limiter = rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false,
 message:{code:"RATE_LIMITED",message:"Too many attempts. Try again later"}});
function credentials(body: unknown): {email:string;password:string} | null {
  if (!body || typeof body!=="object") return null;
  const b=body as Record<string,unknown>;
  if (typeof b.email!=="string" || typeof b.password!=="string") return null;
  const email=b.email.trim().toLowerCase();
  if(email.length>254 || !/^[a-z0-9._%+-]+@mnnit\.ac\.in$/.test(email) || b.password.length<10 || b.password.length>128) return null;
  return {email,password:b.password};
}
authRouter.post("/signup",limiter,async(req,res)=>{
  const c=credentials(req.body);
  const name=typeof req.body?.name==="string"?req.body.name.trim():"";
  if(!c || name.length<2 || name.length>100) {res.status(400).json({code:"BAD_REQUEST",message:"Enter a name, your @mnnit.ac.in email and a password of 10–128 characters"});return;}
  if(req.body.role && req.body.role!=="STUDENT") {res.status(400).json({code:"BAD_REQUEST",message:"Public registration is for students"});return;}
  const id=randomUUID(); const passwordHash=await hashPassword(c.password);
  const created=await prisma.$transaction(async tx=>{
    const count=await tx.$executeRaw`INSERT INTO "User" ("id","name","email","role") VALUES (${id},${name},${c.email},'STUDENT') ON CONFLICT ("email") DO NOTHING`;
    if(!count) return false;
    await tx.$executeRaw`INSERT INTO "AuthCredential" ("userId","passwordHash") VALUES (${id},${passwordHash})`;
    return true;
  });
  if(!created){res.status(409).json({code:"ACCOUNT_EXISTS",message:"Account already exists. Log in or contact the administrator"});return;}
  res.status(201).json({user:{id,name,email:c.email,role:"STUDENT"},message:"Account created. Please log in. Membership requires activation."});
});
authRouter.post("/login",limiter,async(req,res)=>{
  const c=credentials(req.body);
  if(!c){res.status(400).json({code:"BAD_REQUEST",message:"Enter your college email and password (10–128 characters)"});return;}
  const rows=await prisma.$queryRaw<(User & {passwordHash:string|null})[]>`
    SELECT u."id",u."name",u."email",u."role",c."passwordHash" FROM "User" u
    LEFT JOIN "AuthCredential" c ON c."userId"=u."id" WHERE u."email"=${c.email}`;
  const user=rows[0];
  const valid=await verifyPassword(c.password,user?.passwordHash ?? await dummyHash);
  if(!user?.passwordHash || !valid){res.status(401).json({code:"INVALID_CREDENTIALS",message:"Invalid email or password"});return;}
  const token=randomBytes(32).toString("hex"); const hash=tokenHash(token);
  const expiresAt=new Date(Date.now()+7*24*60*60*1000);
  await prisma.$executeRaw`INSERT INTO "AuthSession" ("tokenHash","userId","expiresAt") VALUES (${hash},${user.id},${expiresAt})`;
  res.json({token,expiresAt:expiresAt.toISOString(),user:{id:user.id,name:user.name,email:user.email,role:user.role}});
});
authRouter.get("/me",authenticate,(_req,res)=>res.json({user:res.locals.user}));
authRouter.post("/logout",authenticate,async(_req,res)=>{
  await prisma.$executeRaw`DELETE FROM "AuthSession" WHERE "tokenHash"=${res.locals.sessionHash as string}`;
  res.status(204).end();
});
