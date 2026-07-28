import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

/**
 * Domain-locked Google SSO (spec 001 · FR-001/002/003).
 *
 * - Only accounts on ALLOWED_EMAIL_DOMAIN may sign in (enforced in `signIn`, server-side).
 * - Employees are pre-registered by HR; we do NOT auto-provision on first login. An account
 *   with no matching registry record is refused (never silently created as an admin).
 * - Bootstrap admins: any email in ADMIN_EMAILS is elevated to SUPER_USER on sign-in.
 * - Sessions are JWTs; role + id are attached from the registry.
 */
const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN ?? "").toLowerCase();
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ user, profile }) {
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
