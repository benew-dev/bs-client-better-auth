import { NextResponse } from "next/server";
import cloudinary from "cloudinary";
import dbConnect from "@/backend/config/dbConnect";
import { captureException, captureMessage } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import {
  extractUserInfoFromRequest,
  isAuthenticatedUser,
} from "@/lib/auth-utils";

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * POST /api/auth/me/update/sign-cloudinary-params
 * Signe les paramètres pour l'upload Cloudinary sécurisé
 * Rate limit: Configuration intelligente - api.upload (10 req/5min, strict)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/auth/*
 */
export const POST = withIntelligentRateLimit(
  async function (req) {
    try {
      // 1. Vérifier les variables d'environnement
      if (
        !process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
        !process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        captureMessage("Cloudinary configuration missing", {
          level: "error",
          tags: { component: "api", route: "sign-cloudinary-params" },
        });

        return NextResponse.json(
          {
            success: false,
            message: "Server configuration error",
          },
          { status: 500 },
        );
      }

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

      // 3. Vérifier que le compte est actif
      if (user.isActive === false) {
        return NextResponse.json(
          {
            success: false,
            message: "Account is deactivated",
          },
          { status: 403 },
        );
      }

      // 4. Connexion DB (pour logging/vérifications supplémentaires si nécessaire)
      await dbConnect();

      // 5. Parser et valider le body
      let body;
      try {
        body = await req.json();
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid request body",
          },
          { status: 400 },
        );
      }

      // 6. Valider la présence de paramsToSign
      if (
        !body ||
        !body.paramsToSign ||
        typeof body.paramsToSign !== "object"
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Missing or invalid paramsToSign",
          },
          { status: 400 },
        );
      }

      const { paramsToSign } = body;

      // 7. Configuration du dossier et restrictions
      paramsToSign.folder = "buyitnow/avatars";

      // 8. Générer la signature
      let signature;
      try {
        signature = cloudinary.utils.api_sign_request(
          paramsToSign,
          process.env.CLOUDINARY_API_SECRET,
        );
      } catch (error) {
        console.error("Cloudinary signature error:", error);

        captureException(error, {
          tags: {
            component: "api",
            route: "sign-cloudinary-params",
            action: "signature_generation",
          },
          extra: {
            userId: user.id,
          },
        });

        return NextResponse.json(
          {
            success: false,
            message: "Failed to generate signature",
          },
          { status: 500 },
        );
      }

      console.log("Signature generated successfully");

      // 9. Logger l'activité (sans données sensibles)
      if (process.env.NODE_ENV === "production") {
        console.info("Cloudinary signature generated", {
          userId: user.id.toString().substring(0, 8) + "...",
          folder: paramsToSign.folder,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log("Cloudinary params signed:", {
          userId: user.id,
          folder: paramsToSign.folder,
          publicId: paramsToSign.public_id,
        });
      }

      // 10. Retourner la signature avec les paramètres nécessaires
      return NextResponse.json(
        {
          success: true,
          message: "Signature generated successfully",
          signature,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      console.error("Sign cloudinary params error:", error);

      // Capturer l'erreur dans Sentry
      captureException(error, {
        tags: {
          component: "api",
          route: "sign-cloudinary-params",
        },
        extra: {
          errorName: error.name,
        },
      });

      // Retourner une erreur générique en production
      const errorMessage =
        process.env.NODE_ENV === "production"
          ? "Something went wrong"
          : error.message || "Internal server error";

      return NextResponse.json(
        {
          success: false,
          message: errorMessage,
        },
        { status: error.status || 500 },
      );
    }
  },
  {
    category: "api",
    action: "upload",
    extractUserInfo: extractUserInfoFromRequest,
  },
);
