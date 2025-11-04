import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import dbConnect from "@/backend/config/dbConnect";
import Category from "@/backend/models/category";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import { extractUserInfoFromRequest } from "@/lib/auth-utils";

/**
 * GET /api/category
 * Récupère toutes les catégories actives
 * Rate limit: Configuration intelligente - publicRead (100 req/min) ou authenticatedRead (200 req/min)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/category/* :
 * - Cache-Control: public, max-age=300, stale-while-revalidate=600
 * - CDN-Cache-Control: max-age=600
 * - X-Content-Type-Options: nosniff
 * - Vary: Accept-Encoding
 *
 * Headers globaux de sécurité (toutes routes) :
 * - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
 * - X-Frame-Options: SAMEORIGIN
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: [configuration restrictive]
 * - Content-Security-Policy: [configuration complète]
 *
 * Note: Les catégories sont des données publiques avec cache long
 * car elles changent rarement dans un e-commerce
 */
export const GET = withIntelligentRateLimit(
  // eslint-disable-next-line no-unused-vars
  async function (req) {
    try {
      // Connexion DB
      await dbConnect();

      // Récupérer les catégories actives avec plus de détails
      const categories = await Category.find({ isActive: true })
        .select("categoryName")
        .sort({ categoryName: 1 })
        .lean();

      // Vérifier s'il y a des catégories
      if (!categories || categories.length === 0) {
        return NextResponse.json(
          {
            success: true,
            message: "No categories available",
            data: {
              categories: [],
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

      // Formater les catégories pour optimiser la réponse
      const formattedCategories = categories.map((cat) => ({
        _id: cat._id,
        name: cat.categoryName,
      }));

      // Calculer un hash simple pour l'ETag (optionnel)
      const dataHash = Buffer.from(JSON.stringify(formattedCategories))
        .toString("base64")
        .substring(0, 20);

      return NextResponse.json(
        {
          success: true,
          data: {
            categories: formattedCategories,
            count: formattedCategories.length,
            meta: {
              timestamp: new Date().toISOString(),
              etag: dataHash,
              cached: true,
              cacheMaxAge: 300, // Informer le client du cache
            },
          },
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Categories fetch error:", error.message);

      // Capturer seulement les vraies erreurs système
      captureException(error, {
        tags: {
          component: "api",
          route: "category/GET",
          error_type: error.name,
        },
        extra: {
          message: error.message,
          stack: error.stack,
        },
      });

      // Gestion améliorée des erreurs
      let status = 500;
      let message = "Failed to fetch categories";
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
    extractUserInfo: extractUserInfoFromRequest, // ✅ Utiliser Better Auth au lieu de next-auth
  },
);
