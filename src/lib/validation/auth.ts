import { z } from "zod";

const MAX_BCRYPT_PASSWORD_BYTES = 72;

function fitsBcryptLimit(value: string): boolean {
  return new TextEncoder().encode(value).byteLength <= MAX_BCRYPT_PASSWORD_BYTES;
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .max(254, "O e-mail é muito longo.")
  .email("Informe um e-mail válido.")
  .transform((value) => value.toLocaleLowerCase("en-US"));

/** Login deliberately has no complexity check, to keep error timing uniform. */
export const loginPasswordSchema = z
  .string()
  .min(1, "Informe a senha.")
  .refine(fitsBcryptLimit, "A senha é muito longa.");

export const newPasswordSchema = z
  .string()
  .min(12, "Use pelo menos 12 caracteres.")
  .refine(fitsBcryptLimit, "A senha deve ter no máximo 72 bytes.");

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const changePasswordSchema = z
  .strictObject({
    currentPassword: loginPasswordSchema,
    newPassword: newPasswordSchema,
    confirmation: z.string(),
  })
  .refine((input) => input.newPassword === input.confirmation, {
    message: "A confirmação da senha não confere.",
    path: ["confirmation"],
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "A nova senha deve ser diferente da senha atual.",
    path: ["newPassword"],
  });

export const resetPasswordRequestSchema = z.strictObject({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .strictObject({
    token: z.string().trim().min(32).max(512),
    password: newPasswordSchema,
    confirmation: z.string(),
  })
  .refine((input) => input.password === input.confirmation, {
    message: "A confirmação da senha não confere.",
    path: ["confirmation"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}
