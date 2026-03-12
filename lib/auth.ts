import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// ─── Platform Admin (hardcoded, no tenant) ───────────────────────────────────
// Set PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD in env.
// This account sits above all tenants and can manage schools/instances.
const PLATFORM_EMAIL = process.env.PLATFORM_ADMIN_EMAIL;
const PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD;

// Determine tenant from email domain
async function findTenantByDomain(email: string) {
  const domain = email.split("@")[1];
  if (!domain) return null;
  return prisma.tenant.findFirst({ where: { domain } });
}

// Find or provision a user on first SSO login
async function findOrCreateSsoUser(email: string, name: string | null, azureId: string) {
  // Try by azureId first, then email
  let user = await prisma.user.findFirst({
    where: { OR: [{ azureId }, { email }] },
    include: { tenant: true },
  });

  if (user) {
    // Sync azureId if missing
    if (!user.azureId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { azureId, name: name ?? user.name },
        include: { tenant: true },
      });
    }
    return user;
  }

  // New user — provision with STUDENT role, find tenant by email domain
  const tenant = await findTenantByDomain(email);
  if (!tenant) return null; // No matching tenant = not allowed

  return prisma.user.create({
    data: {
      email,
      name,
      azureId,
      role: "STUDENT",
      tenantId: tenant.id,
      active: true,
    },
    include: { tenant: true },
  });
}

const azureAdConfigured =
  !!process.env.AZURE_AD_CLIENT_ID &&
  !!process.env.AZURE_AD_CLIENT_SECRET &&
  !!process.env.AZURE_AD_TENANT_ID;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    // Azure AD SSO — enabled when env vars are set
    ...(azureAdConfigured
      ? [
          AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            // Use "common" for multi-tenant (any school), or a specific tenant ID
            tenantId: process.env.AZURE_AD_TENANT_ID!,
            authorization: {
              params: {
                scope: "openid profile email",
              },
            },
          }),
        ]
      : []),
    // Credentials — platform admin + tenant users
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // ── Platform admin check (hardcoded, env-based) ──
        if (
          PLATFORM_EMAIL &&
          PLATFORM_PASSWORD &&
          credentials.email === PLATFORM_EMAIL &&
          credentials.password === PLATFORM_PASSWORD
        ) {
          return {
            id: "platform-admin",
            email: PLATFORM_EMAIL,
            name: "Platform Admin",
            role: "PLATFORM_ADMIN",
            tenantId: null,
          } as any;
        }

        // ── Tenant user check ──
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { tenant: true },
        });

        if (!user || !user.active) return null;

        // If user has a password hash, verify it; otherwise allow any password
        // (supports dev seed accounts and the /setup bootstrap flow)
        if (user.password) {
          const valid = await bcrypt.compare(credentials.password, user.password);
          if (!valid) return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Azure AD SSO path — provision user on first login
      if (account?.provider === "azure-ad") {
        const email = user.email;
        if (!email) return false;

        const azureId = account.providerAccountId;
        const name = user.name ?? (profile as any)?.name ?? null;

        const dbUser = await findOrCreateSsoUser(email, name, azureId);
        if (!dbUser || !dbUser.active) return false;

        // Attach our DB fields to the user object for jwt callback
        (user as any).id = dbUser.id;
        (user as any).role = dbUser.role;
        (user as any).tenantId = dbUser.tenantId;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
      }
      // On Azure AD token refresh, re-fetch fresh role from DB
      if (account?.provider === "azure-ad" && !token.role) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email! },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.tenantId = dbUser.tenantId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).tenantId = token.tenantId;
      }
      return session;
    },
  },
};

export const azureAdEnabled = azureAdConfigured;
