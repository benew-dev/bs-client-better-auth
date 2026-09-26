// app/api/v1/products/route.js

import { NextResponse } from "next/server";
import dbConnect from "@/backend/config/dbConnect";
import Product from "@/backend/models/product";
import Category from "@/backend/models/category";
import APIFilters from "@/backend/utils/APIFilters";
import { captureException } from "@/monitoring/sentry";
import {
  parseProductSearchParams,
  isValidObjectId,
} from "@/utils/inputSanitizer";
import { validateProductFilters } from "@/helpers/validation/schemas/product";
import { withIntelligentRateLimit } from "@/utils/rateLimit";

// Configuration simple
const DEFAULT_PER_PAGE = process.env.DEFAULT_PRODUCTS_PER_PAGE;
const MAX_PER_PAGE = process.env.MAX_PRODUCTS_PER_PAGE;

/**
 * GET /api/v1/products
 * Version mobile : récupère la liste des produits avec filtres et pagination
 * Route publique, aucune authentification requise.
 * Rate limit: publicRead (100 req/min)
 *
 * Différence avec la route web : une catégorie invalide renvoie 400
 * au lieu d'être ignorée silencieusement.
 */
export const GET = withIntelligentRateLimit(
  async function (req) {
    try {
      // Connexion DB
      await dbConnect();

      // Catégorie invalide => 400 (décision mobile)
      const rawCategory = req.nextUrl.searchParams.get("category");
      if (rawCategory && !isValidObjectId(rawCategory)) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid parameters",
            errors: { category: "ID catégorie invalide" },
          },
          { status: 400 },
        );
      }

      // Sanitisation des paramètres
      const sanitizedParams = parseProductSearchParams(
        req.nextUrl.searchParams,
      );

      // Validation des paramètres sanitisés
      const validation = await validateProductFilters(sanitizedParams);
      if (!validation.isValid) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid parameters",
            errors: validation.errors,
          },
          { status: 400 },
        );
      }

      // Utiliser les données validées
      const validatedParams = validation.data;
      const searchParams = new URLSearchParams();
      Object.entries(validatedParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") {
          searchParams.set(key, value);
        }
      });

      // Configuration de la pagination
      const resPerPage = Math.min(MAX_PER_PAGE, Math.max(1, DEFAULT_PER_PAGE));

      // Créer les filtres avec les paramètres validés
      const apiFilters = new APIFilters(
        Product.find({ isActive: true })
          .select("name description stock price images category")
          .slice("images", 1),
        searchParams,
      )
        .search()
        .filter();

      // Compter les produits filtrés
      const filteredProductsCount = await apiFilters.query
        .clone()
        .lean()
        .countDocuments();

      // Ajouter la pagination
      apiFilters.pagination(resPerPage);

      // Récupérer les produits
      const products = await apiFilters.query
        .populate("category", "categoryName")
        .lean();

      // Calculer les métadonnées
      const totalPages = Math.ceil(filteredProductsCount / resPerPage);

      const responseData = {
        success: true,
        data: {
          totalPages,
          totalProducts: filteredProductsCount,
          products: products || [],
        },
      };

      const cacheHeaders = {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600", // 5min cache, 10min stale
        "CDN-Cache-Control": "max-age=600", // 10min pour CDN si utilisé
      };

      return NextResponse.json(responseData, {
        status: 200,
        headers: cacheHeaders,
      });
    } catch (error) {
      console.error("Products fetch error:", error.message);

      // Capturer seulement les vraies erreurs système
      if (error.name !== "ValidationError") {
        captureException(error, {
          tags: { component: "api", route: "v1/products/GET" },
          extra: {
            query: req.nextUrl.search,
          },
        });
      }

      // Gestion simple des erreurs
      let status = 500;
      let message = "Failed to fetch products";

      if (error.name === "ValidationError") {
        status = 400;
        message = "Invalid parameters";
      } else if (error.message?.includes("timeout")) {
        status = 504;
        message = "Request timeout";
      }

      return NextResponse.json(
        {
          success: false,
          message,
        },
        { status },
      );
    }
  },
  {
    category: "api",
    action: "publicRead",
  },
);
