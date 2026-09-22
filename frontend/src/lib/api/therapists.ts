import type {
  ScheduleOverride,
  ScheduleOverrideCreate,
  ScheduleOverrideUpdate,
  Therapist,
  TherapistCreate,
  TherapistListItem,
  TherapistUpdate,
} from "@/types/api";

import { api } from "./client";

export const listTherapists = () => api<TherapistListItem[]>("/therapists");

export const getTherapist = (id: string) => api<Therapist>(`/therapists/${id}`);

export const createTherapist = (body: TherapistCreate) =>
  api<Therapist>("/therapists", { method: "POST", body });

export const updateTherapist = (id: string, body: TherapistUpdate) =>
  api<Therapist>(`/therapists/${id}`, { method: "PATCH", body });

export const deleteTherapist = (id: string) =>
  api<void>(`/therapists/${id}`, { method: "DELETE" });

export const listOverrides = (therapistId: string) =>
  api<ScheduleOverride[]>(`/therapists/${therapistId}/schedule-overrides`);

export const createOverride = (therapistId: string, body: ScheduleOverrideCreate) =>
  api<ScheduleOverride>(`/therapists/${therapistId}/schedule-overrides`, {
    method: "POST",
    body,
  });

export const updateOverride = (
  therapistId: string,
  overrideId: string,
  body: ScheduleOverrideUpdate,
) =>
  api<ScheduleOverride>(`/therapists/${therapistId}/schedule-overrides/${overrideId}`, {
    method: "PATCH",
    body,
  });

export const deleteOverride = (therapistId: string, overrideId: string) =>
  api<void>(`/therapists/${therapistId}/schedule-overrides/${overrideId}`, {
    method: "DELETE",
  });
