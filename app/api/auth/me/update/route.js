import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { validateProfile } from "@/helpers/validation/schemas/user";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import { getAuth } from "@/lib/auth";
import {
  extractUserInfoFromRequest,
  isAuthenticatedUser,
} from "@/lib/auth-utils";

/**
 * PUT /api/auth/me/update
 * Met à jour le profil utilisateur AVEC adresse via Better Auth
 * Rate limit: Configuration intelligente - api.write (30 req/min pour utilisateurs authentifiés)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/auth/*
 */
export const PUT = withIntelligentRateLimit(
  async function (req) {
    try {
      // Vérifier l'authentification
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

      // 2. Vérifier que le compte est actif
      if (user.isActive === false) {
        return NextResponse.json(
          { success: false, message: "Account is deactivated" },
          { status: 403 },
        );
      }

      // 3. Parser le body
      let profileData;
      try {
        profileData = await req.json();
      } catch (error) {
        return NextResponse.json(
          { success: false, message: "Invalid request body" },
          { status: 400 },
        );
      }

      // 4. Validation avec Yup (inclut l'adresse)
      const validation = await validateProfile(profileData);
      if (!validation.isValid) {
        return NextResponse.json(
          {
            success: false,
            message: "Validation failed",
            errors: validation.errors,
          },
          { status: 400 },
        );
      }

      // 5. Préparer les données à mettre à jour
      const allowedFields = ["name", "phone", "avatar", "address"];
      const updateData = {};

      allowedFields.forEach((field) => {
        if (validation.data[field] !== undefined) {
          updateData[field] = validation.data[field];
        }
      });

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          { success: false, message: "No fields to update" },
          { status: 400 },
        );
      }

      const auth = await getAuth();

      // 6. Mise à jour via Better Auth API
      const updatedUser = await auth.api.updateUser({
        body: updateData,
        headers: await headers(),
      });

      if (!updatedUser) {
        return NextResponse.json(
          { success: false, message: "Update failed" },
          { status: 500 },
        );
      }

      // ✅ NOUVEAU : Invalider le cache de session Better Auth
      // Créer une nouvelle réponse avec un header spécial
      const response = NextResponse.json(
        {
          success: true,
          message: "Profile updated successfully",
          data: {
            updatedUser: {
              id: updatedUser.id,
              name: updatedUser.name,
              email: updatedUser.email,
              phone: updatedUser.phone,
              avatar: updatedUser.avatar,
              address: updatedUser.address,
              role: updatedUser.role,
              isActive: updatedUser.isActive || true,
            },
          },
        },
        { status: 200 },
      );

      // ✅ Ajouter un header pour signaler au client de rafraîchir
      response.headers.set("X-Session-Updated", "true");

      return response;
    } catch (error) {
      console.error("Profile update error:", error.message);

      if (error.name !== "ValidationError") {
        captureException(error, {
          tags: { component: "api", route: "auth/me/update" },
        });
      }

      return NextResponse.json(
        {
          success: false,
          message:
            error.name === "ValidationError"
              ? "Invalid profile data"
              : "Something went wrong",
        },
        { status: error.name === "ValidationError" ? 400 : 500 },
      );
    }
  },
  {
    category: "api",
    action: "write",
    extractUserInfo: extractUserInfoFromRequest,
  },
);
