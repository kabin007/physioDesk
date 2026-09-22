import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { LoginVisual } from "@/components/auth/login-visual";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <LoginVisual />
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
