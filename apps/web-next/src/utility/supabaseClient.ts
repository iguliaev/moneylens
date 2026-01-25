import { createClient } from "@refinedev/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY!;

console.log("SUPABASE_URL:", SUPABASE_URL);
console.log("SUPABASE_KEY:", SUPABASE_KEY);
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: {
    schema: "public",
  },
  auth: {
    persistSession: true,
  },
});
