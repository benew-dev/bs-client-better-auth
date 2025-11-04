import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import dbConnect from "@/backend/config/dbConnect";
import { validateProfile } from "@/helpers/validation/schemas/user";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import { isAuthenticatedUser } from "@/lib/auth-utils";

/**
 * PUT /api/auth/me/update
 * Met à jour le profil utilisateur AVEC adresse
 * Rate limit: Configuration intelligente - api.write (30 req/min pour utilisateurs authentifiés)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/auth/*
 */
export const PUT = withIntelligentRateLimit(
  async function (req) {
    try {
      const user = await isAuthenticatedUser();

      if (!user) {
        return NextResponse.json(
          { success: false, message: "User not found" },
          { status: 404 },
        );
      }

      await dbConnect();

      let profileData;
      try {
        profileData = await req.json();
      } catch (error) {
        return NextResponse.json(
          { success: false, message: "Invalid request body" },
          { status: 400 },
        );
      }

      // Validation avec Yup (inclut maintenant l'adresse)
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

      // MODIFIÉ: Champs autorisés incluent maintenant l'adresse
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

      const updatedUser = await User.findOneAndUpdate(
        { email: req.user.email },
        updateData,
        {
          new: true,
          runValidators: true,
          select: "-password",
        },
      );

      if (!updatedUser) {
        return NextResponse.json(
          { success: false, message: "Update failed" },
          { status: 500 },
        );
      }

      // MODIFIÉ: Réponse inclut maintenant l'adresse
      return NextResponse.json(
        {
          success: true,
          message: "Profile updated successfully",
          data: {
            updatedUser: {
              _id: updatedUser.id,
              name: updatedUser.name,
              email: updatedUser.email,
              phone: updatedUser.phone,
              avatar: updatedUser.avatar,
              address: updatedUser.address, // NOUVEAU
              role: updatedUser.role,
              isActive: updatedUser.isActive || false,
            },
          },
        },
        { status: 200 },
      );
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
          "[UPDATE_PROFILE] Error extracting user from JWT:",
          error.message,
        );
        return {};
      }
    },
  },
);
