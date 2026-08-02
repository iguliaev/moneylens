import type { Database } from "../types/database.types";
import { supabaseClient } from "./supabaseClient";

type UserSettingsUpdate = Database["public"]["Tables"]["user_settings"]["Update"];

/**
 * Upserts a partial patch onto the caller's user_settings row. `user_id` is
 * deliberately omitted from every caller's payload — the set_user_id trigger
 * fills it in server-side — so this is the one place that (user_id) conflict
 * target is written, shared by the currency and transaction-defaults settings.
 */
export const upsertUserSettings = (patch: UserSettingsUpdate) =>
  supabaseClient.from("user_settings").upsert(patch, { onConflict: "user_id" });
