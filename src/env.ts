import z from "zod";

export const GeneralEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
});

export const SecretEnvSchema = z.object({
  JWT_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url({ pattern: /^http(?:s)?:\/\// }).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Allow origins for CORS can be added here in the future
  ALLOW_CORS_ORIGINS: z.string()
    .transform((val) => val.split(",").map((origin) => origin.trim()))
    .default(["*"]),
});

export const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.url({ pattern: /^postgres(?:ql)?:\/\// }),
  REDIS_URL: z.url({ pattern: /^redis:\/\// }).optional(),
});

export const TelemetryEnvSchema = z.object({
  OTEL_SERVICE_NAME: z.string().default("momoi"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  LOG_FORMAT: z.enum(["json", "plain"]).default("plain"),
  LOG_PRETTY: z.coerce.boolean().default(false),
});

export const EnvSchema = z.object({
  ...GeneralEnvSchema.shape,
  ...SecretEnvSchema.shape,
  ...DatabaseEnvSchema.shape,
  ...TelemetryEnvSchema.shape,
});

const parsedEnv = EnvSchema.safeParse(process.env);

function getEnv(): z.infer<typeof EnvSchema> {
  if (!parsedEnv.success && process.env.NODE_ENV !== "test") {
    console.error("❌ Invalid environment variables:", z.formatError(parsedEnv.error));
    process.exit(1);
  }

  const parsed = parsedEnv.data!;
  process.env.LOG_PRETTY = parsed.LOG_PRETTY.toString();

  return parsed;
}

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = getEnv();
