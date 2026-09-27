// app/api/v1/me/update_password/route.js

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import dbConnect from "@/backend/config/dbConnect";
import { validatePasswordUpdate } from "@/helpers/validation/schemas/auth";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import { getAuth } from "@/lib/auth";
import {
  extractUserInfoFromRequest,
  isAuthenticatedUser,
} from "@/lib/auth-utils";

/**
 * PUT /api/v1/auth/me/update_password
 * Version mobile : met à jour le mot de passe utilisateur via Better Auth.
 * Rate limit: 3 tentatives par heure, strict.
 */
export const PUT = withIntelligentRateLimit(
  async function (req) {
    try {
      // 1. Authentification avec Better Auth
      const auth = await getAuth();
      const user = await isAuthenticatedUser();

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: "User not found",
            code: "USER_NOT_FOUND",
          },
          { status: 404 },
        );
      }

      // 2. Parser les données
      let passwordData;
      try {
        passwordData = await req.json();
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: "Corps de requête invalide",
            code: "INVALID_REQUEST_BODY",
          },
          { status: 400 },
        );
      }

      // 3. Validation avec Yup
      const validation = await validatePasswordUpdate({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        confirmPassword: passwordData.confirmPassword,
      });

      if (!validation.isValid) {
        return NextResponse.json(
          {
            success: false,
            message: "Données invalides",
            errors: validation.errors,
            code: "VALIDATION_FAILED",
          },
          { status: 400 },
        );
      }

      // 4. Connexion DB pour vérifier le verrouillage
      const mongooseInstance = await dbConnect();
      const db = mongooseInstance.connection.getClient().db();

      const userDoc = await db.collection("user").findOne({ id: user.id });

      if (!userDoc) {
        return NextResponse.json(
          {
            success: false,
            message: "Utilisateur non trouvé",
            code: "USER_NOT_FOUND",
          },
          { status: 404 },
        );
      }

      // 5. Vérifier si le compte est actif
      if (userDoc.isActive === false) {
        console.log(
          "Password change attempt on suspended account:",
          user.email,
        );
        return NextResponse.json(
          {
            success: false,
            message: "Compte suspendu. Impossible de changer le mot de passe.",
            code: "ACCOUNT_SUSPENDED",
          },
          { status: 403 },
        );
      }

      // 6. Vérifier si le compte est verrouillé
      const isLocked =
        userDoc.lockUntil && new Date(userDoc.lockUntil) > new Date();

      if (isLocked) {
        const lockUntilFormatted = new Date(userDoc.lockUntil).toLocaleString(
          "fr-FR",
        );
        console.log("Password change attempt on locked account:", user.email);
        return NextResponse.json(
          {
            success: false,
            message: `Compte temporairement verrouillé jusqu'à ${lockUntilFormatted}`,
            code: "ACCOUNT_LOCKED",
          },
          { status: 423 },
        );
      }

      // 7. Changer le mot de passe via Better Auth
      const result = await auth.api.changePassword({
        body: {
          currentPassword: validation.data.currentPassword,
          newPassword: validation.data.newPassword,
          revokeOtherSessions: true, // Déconnecter les autres sessions/appareils
        },
        headers: await headers(),
      });

      // 8. Gérer l'échec du changement de mot de passe
      if (!result || result.error) {
        console.log("Invalid current password attempt:", user.email);

        const MAX_LOGIN_ATTEMPTS = 5;
        const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

        const loginAttempts = (userDoc.loginAttempts || 0) + 1;
        const lockUntil =
          loginAttempts >= MAX_LOGIN_ATTEMPTS
            ? new Date(Date.now() + LOCK_TIME)
            : null;

        await db.collection("user").updateOne(
          { id: user.id },
          {
            $set: {
              loginAttempts,
              ...(lockUntil && { lockUntil }),
            },
          },
        );

        const attemptsLeft = Math.max(0, MAX_LOGIN_ATTEMPTS - loginAttempts);
        const message =
          attemptsLeft > 0
            ? `Mot de passe actuel incorrect. ${attemptsLeft} tentative(s) restante(s).`
            : "Trop de tentatives échouées. Compte temporairement verrouillé.";

        return NextResponse.json(
          {
            success: false,
            message,
            code: "INVALID_CURRENT_PASSWORD",
            attemptsLeft,
          },
          { status: 400 },
        );
      }

      // 9. Succès - Réinitialiser les tentatives échouées
      await db.collection("user").updateOne(
        { id: user.id },
        {
          $set: {
            loginAttempts: 0,
            passwordChangedAt: new Date(),
          },
          $unset: { lockUntil: 1 },
        },
      );

      console.log("✅ Password updated successfully for:", {
        email: user.email,
        timestamp: new Date().toISOString(),
      });

      // 10. Log de sécurité pour audit
      console.log("🔒 Security event - Password changed:", {
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString(),
        userAgent: (await headers()).get("user-agent"),
        ip:
          (await headers()).get("x-forwarded-for") ||
          (await headers()).get("x-real-ip") ||
          "unknown",
      });

      // 11. Réponse de succès
      return NextResponse.json(
        {
          success: true,
          message: "Mot de passe mis à jour avec succès",
          data: {
            passwordChangedAt: new Date(),
            securityTokensCleared: true,
            accountUnlocked: true,
            sessionsRevoked: true,
          },
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("❌ Password update error:", error.message);

      // NOUVEAU (absent du fichier source) : détection explicite de l'erreur
      // d'authentification, par cohérence avec les autres routes v1.
      const isAuthError = error.message === "Authentication required";

      if (isAuthError) {
        return NextResponse.json(
          {
            success: false,
            message: "Authentication failed",
            code: "AUTH_FAILED",
          },
          { status: 401 },
        );
      }

      if (error.name === "ValidationError") {
        const validationErrors = {};
        Object.keys(error.errors).forEach((key) => {
          validationErrors[key] = error.errors[key].message;
        });

        return NextResponse.json(
          {
            success: false,
            message: "Erreurs de validation du modèle",
            errors: validationErrors,
            code: "MODEL_VALIDATION_ERROR",
          },
          { status: 400 },
        );
      }

      // Capturer les vraies erreurs système
      if (
        !error.message?.includes("bcrypt") &&
        !error.message?.includes("Invalid current password")
      ) {
        captureException(error, {
          tags: { component: "api", route: "v1/auth/me/update_password" },
          level: "error",
        });
      }

      return NextResponse.json(
        {
          success: false,
          message: "Erreur lors de la mise à jour du mot de passe",
          code: "INTERNAL_SERVER_ERROR",
        },
        { status: 500 },
      );
    }
  },
  {
    category: "api",
    action: "write",
    customStrategy: {
      points: 3,
      duration: 3600000,
      blockDuration: 3600000,
      keyStrategy: "user",
      requireAuth: true,
    },
    extractUserInfo: extractUserInfoFromRequest,
  },
);
