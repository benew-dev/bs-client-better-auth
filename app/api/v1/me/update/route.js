// app/api/v1/me/update/route.js

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { validateProfileContact } from "@/helpers/validation/schemas/user";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import { getAuth } from "@/lib/auth";
import {
  extractUserInfoFromRequest,
  isAuthenticatedUser,
} from "@/lib/auth-utils";

/**
 * PUT /api/v1/auth/me/update
 * Version mobile : met à jour le profil utilisateur (phone + adresse) via Better Auth.
 * Rate limit: api.write (30 req/min pour utilisateurs authentifiés)
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

      // 4. Validation avec Yup (UNIQUEMENT phone + adresse)
      const validation = await validateProfileContact(profileData);

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
      const allowedFields = ["phone", "address"];
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

      // Forcer le refresh du cache de session côté serveur
      await auth.api.getSession({
        query: {
          disableCookieCache: true,
        },
        headers: await headers(),
      });

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

      // Signale au client qu'il doit rafraîchir sa session locale
      // (côté Expo : rappeler authClient.getSession() / useSession().refetch())
      response.headers.set("X-Session-Updated", "true");

      return response;
    } catch (error) {
      console.error("Profile update error:", error.message);

      // NOUVEAU (absent du fichier source) : détection explicite de l'erreur
      // d'authentification, par cohérence avec les autres routes v1.
      if (error.message === "Authentication required") {
        return NextResponse.json(
          {
            success: false,
            message: "Authentication failed",
            code: "AUTH_FAILED",
          },
          { status: 401 },
        );
      }

      if (error.name !== "ValidationError") {
        captureException(error, {
          tags: { component: "api", route: "v1/auth/me/update" },
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
