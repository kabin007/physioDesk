import type { Dashboard } from "@/types/api";

import { api } from "./client";

export const getDashboard = () => api<Dashboard>("/dashboard");
