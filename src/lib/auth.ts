import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import type { Role } from "@prisma/client";

/**
 * Authentication (spec 001 · FR-001/002/003).
 *
 * Two providers:
 *
 * 1. Credentials (username + password) — a TEMPORARY bridge so HR can sign in and use the
 *    app while Google OAuth is being set up. Validated against a single bootstrap admin
 *    account (see BOOTSTRAP_ADMIN_* below); on first successful login it upserts that
 *    account as an active SUPER_USER — no SQL/seed needed. This is intentionally a test-only
 *    login: change BOOTSTRAP_ADMIN_PASSWORD from its default before real use, and remove the
 *    provider (or leave it disabled) once Google SSO is live.
 *
 * 2. Google SSO (domain-locked) — the real sign-in, enabled only when AUTH_GOOGLE_ID /
 *    AUTH_GOOGLE_SECRET are set. Only accounts on ALLOWED_EMAIL_DOMAIN may sign in; employees
 *    are pre-registered by HR (no auto-provision); ADMIN_EMAILS are elevated to SUPER_USER.
 *
 * Sessions are JWTs; role + id are attached from the registry.
 */
const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN ?? "").toLowerCase();
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Temporary bootstrap admin (username/password bridge). Defaults are test-only.
const bootstrapUsername = (
  process.env.BOOTSTRAP_ADMIN_USERNAME ?? "Islam"
).toLowerCase();
const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "1234";
const bootstrapEmail = (
  process.env.BOOTSTRAP_ADMIN_EMAIL ?? "islam.saadany@forefront.consulting"
).toLowerCase();
const bootstrapName = process.env.BOOTSTRAP_ADMIN_NAME ?? "Islam";

// Google is only offered when its credentials are configured.
export const googleAuthEnabled =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const identifier = String(creds?.username ?? "")
          .trim()
          .toLowerCase();
        const password = String(creds?.password ?? "");
        if (!identifier || !password) return null;

        const domainOk = (email: string) =>
          !allowedDomain || email.endsWith(`@${allowedDomain}`);

        // 1) Real per-employee login: match by email, must be an ACTIVE employee
        //    on the allowed domain with a set password that verifies.
        if (identifier.includes("@") && domainOk(identifier)) {
          const dbUser = await prisma.user.findUnique({ where: { email: identifier } });
          if (
            dbUser &&
            dbUser.status === "ACTIVE" &&
            verifyPassword(password, dbUser.passwordHash)
          ) {
            return { id: dbUser.id, email: dbUser.email, name: dbUser.name };
          }
        }

        // 2) Bootstrap admin bridge (username or email + env password) — kept so
        //    the first admin is never locked out before passwords are set.
        const usernameMatches =
          identifier === bootstrapUsername || identifier === bootstrapEmail;
        if (usernameMatches && password === bootstrapPassword) {
          const dbUser = await prisma.user.upsert({
            where: { email: bootstrapEmail },
            update: { role: "SUPER_USER", status: "ACTIVE" },
            create: {
              email: bootstrapEmail,
              name: bootstrapName,
              role: "SUPER_USER",
              status: "ACTIVE",
            },
          });
          return { id: dbUser.id, email: dbUser.email, name: dbUser.name };
        }

        return null;
      },
    }),
    ...(googleAuthEnabled ? [Google] : []),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Credentials were already validated in authorize() above.
      if (account?.provider === "credentials") return true;

      const email = (user.email ?? profile?.email ?? "").toLowerCase();
      if (!email) return false;

      // Domain lock — hard boundary.
      if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) return false;

      // Must match a pre-registered, active employee (no auto-provisioning).
      const dbUser = await prisma.user.findUnique({ where: { email } });
      if (!dbUser) return false;
      if (dbUser.status === "LEFT") return false;

      // Bootstrap: promote allowlisted emails to SUPER_USER if not already.
      if (adminEmails.includes(email) && dbUser.role !== "SUPER_USER") {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { role: "SUPER_USER" },
        });
      }

      // Keep Google profile photo fresh.
      if (user.image && user.image !== dbUser.photoUrl) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { photoUrl: user.image },
        });
      }

      return true;
    },
    async jwt({ token }) {
      const email = (token.email ?? "").toLowerCase();
      if (email) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, name: true },
        });
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as Role) ?? "EMPLOYEE";
      }
      return session;
    },
  },
});
