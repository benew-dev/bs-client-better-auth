// app/api/v1/paymentPlatform/route.js

import { NextResponse } from "next/server";
import dbConnect from "@/backend/config/dbConnect";
import PaymentType from "@/backend/models/paymentType";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import { extractUserInfoFromRequest } from "@/lib/auth-utils";

/**
 * GET /api/v1/paymentPlatform
 * Version mobile : récupère toutes les plateformes de paiement disponibles.
 * Route publique. Rate limit: publicRead (100 req/min) ou authenticatedRead (200 req/min)
 *
 * Note: Les plateformes de paiement sont des données publiques avec cache long
 * car elles changent rarement dans un e-commerce
 */
export const GET = withIntelligentRateLimit(
  async function (req) {
    try {
      // Connexion DB
      await dbConnect();

      // Récupérer toutes les plateformes de paiement
      const paymentPlatforms = await PaymentType.find()
        .sort({ platform: 1 })
        .lean();

      // Vérifier s'il y a des plateformes
      if (!paymentPlatforms || paymentPlatforms.length === 0) {
        return NextResponse.json(
          {
            success: true,
            message: "No payment platforms available",
            data: {
              platforms: [],
              count: 0,
              meta: {
                timestamp: new Date().toISOString(),
                cached: false,
              },
            },
          },
          { status: 200 },
        );
      }

      // Formater les plateformes pour optimiser la réponse
      const formattedPaymentPlatforms = paymentPlatforms.map((payment) => ({
        _id: payment._id,
        platform: payment.platform,
        name: payment.paymentName,
        number: payment.paymentNumber,
      }));

      // Calculer un hash simple pour l'ETag (optionnel)
      const dataHash = Buffer.from(JSON.stringify(formattedPaymentPlatforms))
        .toString("base64")
        .substring(0, 20);

      return NextResponse.json(
        {
          success: true,
          data: {
            platforms: formattedPaymentPlatforms,
            count: formattedPaymentPlatforms.length,
            meta: {
              timestamp: new Date().toISOString(),
              etag: dataHash,
              cached: true,
              cacheMaxAge: 300,
            },
          },
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Payment platforms fetch error:", error.message);

      captureException(error, {
        tags: {
          component: "api",
          route: "v1/payment-platforms/GET",
          error_type: error.name,
        },
        extra: {
          message: error.message,
          stack: error.stack,
        },
      });

      let status = 500;
      let message = "Failed to fetch payment platforms";
      let code = "INTERNAL_ERROR";

      if (
        error.name === "MongoNetworkError" ||
        error.message?.includes("connection")
      ) {
        status = 503;
        message = "Database connection error";
        code = "DB_CONNECTION_ERROR";
      } else if (error.message?.includes("timeout")) {
        status = 504;
        message = "Request timeout";
        code = "TIMEOUT";
      }

      return NextResponse.json(
        {
          success: false,
          message,
          code,
          ...(process.env.NODE_ENV === "development" && {
            error: error.message,
          }),
        },
        { status },
      );
    }
  },
  {
    category: "api",
    action: "publicRead",
    extractUserInfo: extractUserInfoFromRequest,
  },
);
