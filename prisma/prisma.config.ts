import { defineConfig } from "prisma/config";
import { config } from "dotenv";
import path from "path";

// Load .env from project root (Prisma 7 doesn't auto-load it for config files)
config({ path: path.resolve(__dirname, "../.env") });

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? "file:../dev.db",
  },
});
