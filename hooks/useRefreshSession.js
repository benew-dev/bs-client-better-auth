"use client";

import { useCallback } from "react";

export function useRefreshSession() {
  const refreshSession = useCallback(async () => {
    try {
      // ✅ Forcer Better Auth à invalider son cache
      const response = await fetch("/api/auth/get-session", {
        method: "GET",
        credentials: "include",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (response.ok) {
        // ✅ DÉCLENCHER UN ÉVÉNEMENT CUSTOM QUE LES COMPOSANTS ÉCOUTERONT
        window.dispatchEvent(new Event("session-refresh"));

        // Petit délai pour laisser le cache se vider
        await new Promise((resolve) => setTimeout(resolve, 200));

        return true;
      }

      return false;
    } catch (error) {
      console.error("Failed to refresh session:", error);
      return false;
    }
  }, []);

  return refreshSession;
}
