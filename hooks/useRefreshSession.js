"use client";

import { useCallback } from "react";
import { authClient } from "@/lib/auth-client";

export function useRefreshSession() {
  const refreshSession = useCallback(async () => {
    try {
      // ✅ Forcer Better Auth à refetch la session depuis le serveur
      // Cette méthode interne force le rechargement
      if (authClient.$Infer?.Session) {
        // Appeler l'endpoint get-session pour forcer le refresh
        const response = await fetch("/api/auth/get-session", {
          method: "GET",
          credentials: "include",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (response.ok) {
          // Déclencher un événement pour que useSession se mette à jour
          window.dispatchEvent(new CustomEvent("better-auth:session-updated"));

          // Attendre un peu que le cache se mette à jour
          await new Promise((resolve) => setTimeout(resolve, 100));

          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Failed to refresh session:", error);
      return false;
    }
  }, []);

  return refreshSession;
}
