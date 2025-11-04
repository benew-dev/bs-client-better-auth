import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import bcryptjs from "bcryptjs";
// import dbConnect from "@/backend/config/dbConnect";
import { validatePasswordUpdate } from "@/helpers/validation/schemas/auth";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import { isAuthenticatedUser } from "@/lib/auth-utils";

/**
 * PUT /api/auth/me/update_password
 * Met à jour le mot de passe utilisateur avec sécurité renforcée
 * Rate limit: Configuration intelligente personnalisée (3 tentatives par heure, strict)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/auth/*
 */
export const PUT = withIntelligentRateLimit(
  async function (req) {
    try {
      // Vérifier l'authentification
      const user = await isAuthenticatedUser();

      // Parser les données avec gestion d'erreur
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

      // ✅ AMÉLIORATION: Validation avec Yup
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

      // Connexion DB
      // await dbConnect();

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: "Utilisateur non trouvé",
            code: "USER_NOT_FOUND",
          },
          { status: 404 },
        );
      }

      // ✅ AMÉLIORATION: Vérifier si le compte est actif
      if (!user.isActive) {
        console.log(
          "Password change attempt on suspended account:",
          req.user.email,
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

      // ✅ AMÉLIORATION: Vérifier si le compte n'est pas verrouillé
      if (user.isLocked()) {
        const lockUntilFormatted = new Date(user.lockUntil).toLocaleString(
          "fr-FR",
        );
        console.log(
          "Password change attempt on locked account:",
          req.user.email,
        );
        return NextResponse.json(
          {
            success: false,
            message: `Compte temporairement verrouillé jusqu'à ${lockUntilFormatted}`,
            code: "ACCOUNT_LOCKED",
          },
          { status: 423 }, // Locked
        );
      }

      // Vérifier le mot de passe actuel
      const isPasswordValid = await bcryptjs.compare(
        validation.data.currentPassword,
        user.password,
      );

      if (!isPasswordValid) {
        console.log("Invalid current password attempt:", req.user.email);

        // ✅ AMÉLIORATION: Incrémenter tentatives échouées
        await user.incrementLoginAttempts();

        const attemptsLeft = Math.max(0, 5 - user.loginAttempts - 1);
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

      // ✅ AMÉLIORATION: Vérifier que le nouveau mot de passe est différent
      const isSamePassword = await bcryptjs.compare(
        validation.data.newPassword,
        user.password,
      );

      if (isSamePassword) {
        return NextResponse.json(
          {
            success: false,
            message: "Le nouveau mot de passe doit être différent de l'ancien",
            code: "SAME_PASSWORD",
          },
          { status: 400 },
        );
      }

      // ✅ AMÉLIORATION: Vérifier l'historique des mots de passe (optionnel)
      // Note: Nécessiterait un champ passwordHistory dans le modèle

      // ✅ AMÉLIORATION: Mettre à jour le mot de passe avec cleanup sécurité
      const oldPasswordChangedAt = user.passwordChangedAt;

      user.password = validation.data.newPassword;
      // passwordChangedAt sera mis à jour automatiquement par le middleware pre-save du modèle

      // ✅ AMÉLIORATION: Nettoyer les tokens et tentatives échouées
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();

      console.log("✅ Password updated successfully for:", {
        email: req.user.email,
        previousChange: oldPasswordChangedAt,
        newChange: user.passwordChangedAt,
      });

      // ✅ AMÉLIORATION: Log de sécurité pour audit
      console.log("🔒 Security event - Password changed:", {
        userId: user._id,
        email: user.email,
        timestamp: new Date().toISOString(),
        userAgent: req.headers.get("user-agent"),
        ip:
          req.headers.get("x-forwarded-for") ||
          req.headers.get("x-real-ip") ||
          "unknown",
      });

      // ✅ AMÉLIORATION: Réponse enrichie avec informations de sécurité
      return NextResponse.json(
        {
          success: true,
          message: "Mot de passe mis à jour avec succès",
          data: {
            passwordChangedAt: user.passwordChangedAt,
            securityTokensCleared: true,
            accountUnlocked: true,
          },
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("❌ Password update error:", error.message);

      // ✅ AMÉLIORATION: Gestion d'erreur spécifique
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

      // Capturer seulement les vraies erreurs système
      if (
        !error.message?.includes("bcrypt") &&
        !error.message?.includes("Invalid current password")
      ) {
        captureException(error, {
          tags: { component: "api", route: "auth/me/update_password" },
          user: { id: req.user?.id, email: req.user?.email },
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
    extractUserInfo: async (req) => {
      try {
        const cookieName =
          process.env.NODE_ENV === "production"
            ? "__Secure-next-auth.session-token"
            : "next-auth.session-token";

        const token = await getToken({
          req,
          secret: process.env.NEXTAUTH_SECRET,
          cookieName,
        });

        return {
          userId: token?.user?._id || token?.user?.id || token?.sub,
          email: token?.user?.email,
        };
      } catch (error) {
        console.error(
          "[UPDATE_PASSWORD] Error extracting user from JWT:",
          error.message,
        );
        return {};
      }
    },
  },
);
