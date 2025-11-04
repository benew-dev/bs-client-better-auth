import { cache } from "react";
import { headers } from "next/headers";
import dbConnect from "@/backend/config/dbConnect";
import { getAuth } from "@/lib/auth"; // ✅ Importer getAuth au lieu de auth

/**
 * Récupère la session Better Auth depuis les cookies de la requête
 * Utilise dans les API Routes
 */
// ✅ NOUVEAU
// Dans getSessionFromRequest
export async function getSessionFromRequest(req) {
  try {
    const auth = await getAuth();

    // ✅ Passer l'objet Request directement
    const session = await auth.api.getSession({
      headers: req.headers, // L'objet Headers natif
    });

    return session;
  } catch (error) {
    console.error("[AUTH] Error getting session:", error.message);
    return null;
  }
}

/**
 * Extraire les informations utilisateur pour le rate limiting
 */
export async function extractUserInfoFromRequest(req) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session?.user) {
      return {};
    }

    return {
      userId: session.user.id,
      email: session.user.email,
    };
  } catch (error) {
    console.error("[AUTH] Error extracting user info:", error.message);
    return {};
  }
}

/**
 * Récupérer l'utilisateur authentifié
 */
export const getAuthenticatedUser = cache(async () => {
  try {
    const auth = await getAuth(); // ✅ Initialiser auth d'abord
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return null;
    }

    return session.user;
  } catch (error) {
    console.error("Failed to get authenticated user:", error);
    return null;
  }
});

/**
 * Vérifier la session
 */
export const verifySession = async () => {
  try {
    const auth = await getAuth(); // ✅ Initialiser auth d'abord
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { success: false, error: "Not authenticated", session: null };
    }

    return { success: true, session };
  } catch (error) {
    console.error("Session verification failed:", error);
    return {
      success: false,
      error: "Session verification failed",
      session: null,
    };
  }
};

/**
 * Middleware d'authentification pour les API routes
 */
export const isAuthenticatedUser = async () => {
  try {
    const auth = await getAuth(); // ✅ Initialiser auth d'abord
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      throw new Error("Not authenticated");
    }

    return session.user;
  } catch (error) {
    throw new Error("Authentication required");
  }
};

/**
 * Gestion des tentatives de connexion échouées
 */
export const incrementLoginAttempts = async (userId) => {
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

  const mongooseInstance = await dbConnect();
  const db = mongooseInstance.connection.getClient().db();

  const user = await db.collection("user").findOne({ id: userId });

  if (!user) return;

  const loginAttempts = (user.loginAttempts || 0) + 1;
  const lockUntil =
    loginAttempts >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOCK_TIME)
      : null;

  await db.collection("user").updateOne(
    { id: userId },
    {
      $set: { loginAttempts, lockUntil },
    },
  );
};

/**
 * Vérifier si le compte est verrouillé
 */
export const isAccountLocked = (user) => {
  return !!(user.lockUntil && new Date(user.lockUntil) > new Date());
};
