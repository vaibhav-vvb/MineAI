import { supabase } from "@/integrations/supabase/client";

export async function ensureValidSession() {
  // First, try to refresh the session
  const { data: { session }, error } = await supabase.auth.refreshSession();
  
  if (error || !session) {
    // If refresh fails, sign out completely and force re-login
    console.error("Session refresh failed, signing out...");
    await supabase.auth.signOut();
    return null;
  }
  
  return session;
}