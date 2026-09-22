"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { LogoMark } from "@/components/layout/logo";
import { fieldAria, FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as authApi from "@/lib/api/auth";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { loginSchema, type LoginValues } from "@/lib/validations/auth";

/** Only allow same-origin relative redirects after login. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });
  const { errors } = form.formState;

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.session, user);
      router.replace(safeNext(searchParams.get("next")));
    },
  });

  const failure =
    login.error instanceof ApiError && login.error.status === 401
      ? "The email/username or password is incorrect."
      : login.error
        ? errorMessage(login.error)
        : null;

  return (
    <div className="w-full max-w-[380px]">
      <LogoMark className="mb-8 lg:hidden" />
      <h1 className="font-heading text-[30px] leading-tight font-medium tracking-[-0.015em]">
        Sign in
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Use your PhysioDesk clinic account.</p>

      <form
        noValidate
        className="mt-8 space-y-5"
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
      >
        {failure && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-3 text-[13px] text-danger"
          >
            <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
            {failure}
          </div>
        )}

        <FormField id="identifier" label="Email or username" error={errors.identifier?.message}>
          <Input
            {...fieldAria("identifier", errors.identifier?.message)}
            autoComplete="username"
            autoFocus
            {...form.register("identifier")}
          />
        </FormField>

        <FormField id="password" label="Password" error={errors.password?.message}>
          <div className="relative">
            <Input
              {...fieldAria("password", errors.password?.message)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="pr-10"
              {...form.register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </FormField>

        <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
