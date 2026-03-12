import { config } from "dotenv";

// Load .env for local CLI usage (no-op in production where env vars are already set)
config();

export default {
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
};
