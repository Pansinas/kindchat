import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable ${name}`);
  return value;
}

/** Server-only configuration. Importing this from a client component fails the build. */
export const serverEnv = {
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get authIdentityDomain() {
    return required("AUTH_IDENTITY_DOMAIN");
  },
  get ipHashSecret() {
    return required("IP_HASH_SECRET");
  },
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Pairvella <no-reply@pairvella.app>",
  isProduction: process.env.NODE_ENV === "production",
};
