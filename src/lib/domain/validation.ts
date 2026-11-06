import { z } from "zod";

/** Must match the CHECK constraints in supabase/migrations. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 160;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX_BYTES = 72; // bcrypt input limit used by Supabase Auth

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usernames are at least 3 characters.")
  .max(20, "Usernames are at most 20 characters.")
  .regex(USERNAME_PATTERN, "Use letters, numbers and underscores only.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Please enter a display name.")
  .max(DISPLAY_NAME_MAX, `Display names are at most ${DISPLAY_NAME_MAX} characters.`)
  // Reject control and bidi-override characters that can be used to spoof names.
  .refine((v) => !/[\u0000-\u001f\u007f‪-‮⁦-⁩]/.test(v), "Display name contains invalid characters.");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .refine((v) => new TextEncoder().encode(v).length <= PASSWORD_MAX_BYTES, "Password is too long.");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const registerSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    recoveryEmail: z.union([emailSchema, z.literal("")]).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(40),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const forgotPasswordSchema = z.object({ username: z.string().trim().min(1).max(40) });

export const resetPasswordSchema = z.object({
  tokenHash: z.string().min(10).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const recoveryEmailSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const passwordConfirmSchema = z.object({ password: z.string().min(1).max(200) });

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
  confirmUsername: z.string().trim().min(1).max(40),
});

export const verifyTokenSchema = z.object({ token: z.string().min(20).max(200) });

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
