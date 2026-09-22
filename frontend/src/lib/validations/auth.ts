import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginValues = z.infer<typeof loginSchema>;
