import { clearAuthCallbackState } from "@/lib/auth";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { trackAuthEvent } from "@/features/dev/account-switcher";

const AuthContext = createContext<{ session: Session | null; loading: boolean }>({
  session: null, loading: true,
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "SIGNED_OUT") clearAuthCallbackState();
      trackAuthEvent(event, next);
      receivedEvent = true;
      if (active) { setSession(next); setLoading(false); }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (active && !receivedEvent) { setSession(data.session); setLoading(false); }
    }).catch(() => {
      if (active && !receivedEvent) setLoading(false);
    });

    const updateRefresh = (state: string) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    if (Platform.OS !== "web") updateRefresh(AppState.currentState);
    const listener = Platform.OS !== "web"
      ? AppState.addEventListener("change", updateRefresh) : undefined;
    return () => {
      active = false;
      subscription.unsubscribe();
      listener?.remove();
      if (Platform.OS !== "web") supabase.auth.stopAutoRefresh();
    };
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
