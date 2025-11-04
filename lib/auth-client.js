import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    "https://bs-client-better-auth.vercel.app",
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  updateUser,
  $fetch, // ✅ Exposer $fetch pour recharger manuellement
} = authClient;

// ✅ Fonction helper pour forcer le refresh de la session
export const refreshSession = async () => {
  try {
    // Better Auth va refetch la session depuis le serveur
    await authClient.$fetch("/api/auth/get-session", {
      method: "GET",
      credentials: "include",
    });

    // Forcer un re-render en déclenchant une mise à jour d'état
    window.dispatchEvent(new Event("better-auth:session-update"));
  } catch (error) {
    console.error("Failed to refresh session:", error);
  }
};
