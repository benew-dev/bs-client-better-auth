import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import dbConnect from "@/backend/config/dbConnect";
import Product from "@/backend/models/product";
import Category from "@/backend/models/category";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";

/**
 * GET /api/products/[id]
 * Récupère un produit par son ID avec produits similaires
 * Rate limit: Configuration intelligente - publicRead (100 req/min) ou authenticatedRead (200 req/min)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/products/* :
 * - Cache-Control: public, max-age=300, stale-while-revalidate=600
 * - CDN-Cache-Control: max-age=600
 * - X-Content-Type-Options: nosniff
 * - Vary: Accept-Encoding
 *
 * Optimisé pour ~500 visiteurs/jour
 * Les utilisateurs authentifiés bénéficient automatiquement de limites doublées
 */
export const GET = withIntelligentRateLimit(
  async function (req, { params }) {
    try {
      // Validation simple de l'ID MongoDB
      const { id } = params;
      if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid product ID format",
          },
          { status: 400 },
        );
      }

      // Connexion DB
      await dbConnect();

      // Récupérer le produit principal
      const product = await Product.findById(id)
        .select(
          "name description price images category stock sold isActive slug",
        )
        .populate("category", "categoryName")
        .lean();

      // Si le produit n'existe pas
      if (!product) {
        return NextResponse.json(
          {
            success: false,
            message: "Product not found",
          },
          { status: 404 },
        );
      }

      // Récupérer les produits similaires (même catégorie)
      let sameCategoryProducts = [];
      if (product.category) {
        try {
          sameCategoryProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: id },
            isActive: true,
          })
            .select("name price images slug")
            .limit(4)
            .lean();
        } catch (error) {
          // Si erreur, continuer sans produits similaires
          console.warn("Failed to fetch similar products:", error.message);
        }
      }

      // Headers de cache pour un produit (change moins souvent)
      const cacheHeaders = {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600", // 5min cache, 10min stale
        "CDN-Cache-Control": "max-age=600", // 10min pour CDN
        ETag: `"${product._id}-${product.updatedAt || Date.now()}"`,
        Vary: "Accept-Language",
      };

      return NextResponse.json(
        {
          success: true,
          data: {
            product,
            sameCategoryProducts,
          },
        },
        {
          status: 200,
          headers: cacheHeaders,
        },
      );
    } catch (error) {
      console.error("Product fetch error:", error.message);

      // Capturer seulement les vraies erreurs système
      if (error.name !== "CastError") {
        captureException(error, {
          tags: {
            component: "api",
            route: "products/[id]/GET",
            productId: params.id,
          },
        });
      }

      // Gestion simple des erreurs
      return NextResponse.json(
        {
          success: false,
          message:
            error.name === "CastError"
              ? "Invalid product ID format"
              : "Failed to fetch product",
        },
        { status: error.name === "CastError" ? 400 : 500 },
      );
    }
  },
  {
    category: "api",
    action: "publicRead",
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
          "[PRODUCTS] Error extracting user from JWT:",
          error.message,
        );
        return {};
      }
    },
  },
);
