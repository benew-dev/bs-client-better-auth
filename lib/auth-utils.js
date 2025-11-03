import { cache } from "react";
import { headers } from "next/headers";
import dbConnect from "@/backend/config/dbConnect";
import { auth } from "@/lib/auth";
import { header } from "@/app/register/page";

/**
 * Récupérer l'utilisateur authentifié (remplace getAuthenticatedUser)
 */
export const getAuthenticatedUser = cache(async () => {
  try {
    const session = await auth.api.getSession({
      headers: await header(),
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
 * Vérifier la session (remplace verifySession)
 */
export const verifySession = async () => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { success: false, error: "Not authenticated" };
    }

    return { success: true, session };
  } catch (error) {
    console.error("Session verification failed:", error);
    return { success: false, error: "Session verification failed" };
  }
};

/**
 * Middleware d'authentification pour les API routes
 */
export const isAuthenticatedUser = async () => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      throw new Error("Not authenticated");
    }

    return session.user;
    // eslint-disable-next-line no-unused-vars
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
