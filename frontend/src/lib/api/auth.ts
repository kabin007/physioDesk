import type { LoginRequest, User } from "@/types/api";

import { request } from "./client";

// Session endpoints live on the BFF (/api/auth/*), which owns the httpOnly token cookies.
export const login = (body: LoginRequest) =>
  request<User>("/api/auth/login", { method: "POST", body });

export const getSession = () => request<User>("/api/auth/session");

export const logout = () => request<void>("/api/auth/logout", { method: "POST" });
