import { createClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase-env";

export const supabase = createClient(
  getSupabaseUrl(),
  getSupabasePublishableKey()
);
