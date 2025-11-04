"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";

/**
 * Hook qui force un re-render quand la session change
 * À utiliser dans Header et Profile
 */
export function useSessionRefresh() {
  const { data: session, isPending } = useSession();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // ✅ Écouter l'événement de refresh
    const handleRefresh = () => {
      console.log("🔄 Session refresh event received");
      setRefreshKey((prev) => prev + 1); // Force un re-render
    };

    window.addEventListener("session-refresh", handleRefresh);

    return () => {
      window.removeEventListener("session-refresh", handleRefresh);
    };
  }, []);

  // Retourner les données de session avec la key de refresh
  return {
    session,
    isPending,
    refreshKey, // Utilisé pour forcer le re-render
  };
}
