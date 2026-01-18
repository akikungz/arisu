import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { customSession, openAPI } from "better-auth/plugins";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";

import { prisma } from "./database.js";
import { env } from "./env.js";


const studentEmailPattern = /^s\d{2}0602\d{7}@email\.kmutnb\.ac\.th$/;

/**
 * Check if email is from IT department (ends with @itm.kmutnb.ac.th)
 */
export function isItDepartmentEmail(email: string): boolean {
  return email.endsWith("@itm.kmutnb.ac.th") || studentEmailPattern.test(email);
}

/**
 * Check if email is an instructor email (contains '@' but not a student email pattern)
 */
export function isInstructorEmail(email: string): boolean {
  // Student emails typically have a numeric pattern
  return isItDepartmentEmail(email) && !studentEmailPattern.test(email);
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  database: env.NODE_ENV === "test" ? undefined : prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.JWT_SECRET,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 3, // 3 hours
      strategy: "jwt",
    },
  },
  trustedOrigins: env.ALLOW_CORS_ORIGINS,
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      scope: ["email", "profile"],
      accessType: "offline",
      prompt: "select_account",
    },
  },
  emailAndPassword: {
    enabled: env.NODE_ENV !== "production",
    requireEmailVerification: false,
  },
  advanced: {
    disableCSRFCheck: true,
    trustedProxyHeaders: true,
    ...(
      env.NODE_ENV === "production"
        ? {
          defaultCookieAttributes: {
            sameSite: "lax",
            secure: true,
            path: "/",
          },
          useSecureCookies: true,
        } : {
          defaultCookieAttributes: {
            sameSite: "lax",
            secure: env.BETTER_AUTH_URL?.startsWith("https://") || false,
            path: "/",
          },
          useSecureCookies: env.BETTER_AUTH_URL?.startsWith("https://") || false,
        }
    )
  },
  logger: {
    disabled: false,
    level: "debug",
  },
  plugins: [
    openAPI(),
    customSession(async ({ user, session }) => {
      // Production: require IT department email
      if (!isItDepartmentEmail(user.email)) {
        throw new Error("Unauthorized: Email is not from IT Department");
      }

      let platformUser = await prisma.platformUser.findUnique({
        where: { userId: user.id },
      });

      if (!platformUser) {
        let userId = user.id;
        if (isInstructorEmail(user.email)) {
          const findMailListing = await prisma.instructorSearch.findUnique({
            where: {
              email: user.email,
              havePlatformId: false
            },
          });

          if (!findMailListing) {
            throw new Error("Unauthorized: Instructor email not found in listing");
          }

          platformUser = await prisma.platformUser.create({
            data: {
              userId,
              role: "INSTRUCTOR",
            },
          });

          await prisma.instructorSearch.update({
            where: { email: user.email },
            data: { havePlatformId: true },
          });
        } else {
          platformUser = await prisma.platformUser.create({
            data: {
              userId,
              role: "STUDENT",
            },
          });
        }
      }

      return {
        user: {
          ...user,
          id: platformUser.id,
          role: platformUser.role,
        },
        session
      };
    }),
  ],
});

/**
 * Auth handler for Hono - mounts better-auth routes at /api/auth
 */
export const authHandler = new Hono()
  .on(["GET", "POST"], "/api/auth/*", (c) => {
    const url = env.BETTER_AUTH_URL?.startsWith("https://")
      ? c.req.url.replace("http://", "https://")
      : c.req.url;
    return auth.handler(new Request(url, c.req.raw));
  });

/**
 * Generate OpenAPI schema for better-auth
 */
export const authOpenAPI = async (_auth: typeof auth = auth) => {
  let _schema: ReturnType<typeof _auth.api.generateOpenAPISchema>;
  const getSchema = async () => (_schema ??= _auth.api.generateOpenAPISchema());

  const OpenAPI = {
    getPaths: (prefix = '/api/auth') =>
      getSchema().then(({ paths }) => {
        const reference: typeof paths = Object.create(null);

        for (const path of Object.keys(paths)) {
          const key = prefix + path;
          reference[key] = paths[path];

          for (const method of Object.keys(paths[path])) {
            const operation = (reference[key] as any)[method];
            operation.tags = ['Better Auth'];
          }
        }

        return reference;
      }) as Promise<any>,
    components: getSchema().then(({ components }) => components) as Promise<any>
  } as const;

  return {
    components: await OpenAPI.components,
    paths: await OpenAPI.getPaths(),
  };
};

/**
 * Auth middleware for Hono - validates session and adds user to context
 */
export const authMiddleware = async (c: any, next: () => Promise<void>) => {
  const cookieName = env.BETTER_AUTH_URL?.startsWith("https://")
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";

  const sessionToken = getCookie(c, cookieName);

  if (!sessionToken) {
    return c.json({ status: 401, message: "Unauthorized: No active session" }, 401);
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ status: 401, message: "Unauthorized: Invalid session" }, 401);
  }

  c.set("user", session.user);
  c.set("session", session.session);

  await next();
};

/**
 * Role-based authorization middleware
 */
export const requireAdmin = async (c: any, next: () => Promise<void>) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ status: 401, message: "Unauthorized: No active session" }, 401);
  }
  if (user.role !== "ADMIN") {
    return c.json({ status: 403, message: "Forbidden: Admins only" }, 403);
  }
  await next();
};

export const requireInstructor = async (c: any, next: () => Promise<void>) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ status: 401, message: "Unauthorized: No active session" }, 401);
  }
  if (user.role === "STUDENT") {
    return c.json({ status: 403, message: "Forbidden: Instructors and Admins only" }, 403);
  }
  await next();
};

export const requireStudent = async (c: any, next: () => Promise<void>) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ status: 401, message: "Unauthorized: No active session" }, 401);
  }
  if (user.role !== "STUDENT") {
    return c.json({ status: 403, message: "Forbidden: Students only" }, 403);
  }
  await next();
};
