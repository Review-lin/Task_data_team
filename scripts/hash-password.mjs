import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const password = process.env.DAYMARK_PASSWORD;
if (!password || password.length < 12) {
  console.error("Set DAYMARK_PASSWORD to a password containing at least 12 characters, then run this command again.");
  process.exit(1);
}

const salt = randomBytes(24);
const hash = await promisify(scryptCallback)(password, salt, 64);
process.stdout.write(`scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}\n`);
