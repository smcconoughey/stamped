// Prisma 7 auto-loads .env before evaluating this file.
// On Render, DATABASE_URL is injected directly from the environment.
export default {
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
};
