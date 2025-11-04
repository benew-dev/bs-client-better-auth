import { NextResponse } from "next/server";
import dbConnect from "@/backend/config/dbConnect";
import isAuthenticatedUser from "@/backend/middlewares/auth";
import Order from "@/backend/models/order";
import User from "@/backend/models/user";
import APIFilters from "@/backend/utils/APIFilters";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import { getToken } from "next-auth/jwt";

/**
 * GET /api/orders/me
 * Récupère l'historique des commandes de l'utilisateur connecté
 * Rate limit: Configuration intelligente - authenticatedRead (200 req/min)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/orders/* :
 * - Cache-Control: private, no-cache, no-store, must-revalidate
 * - Pragma: no-cache
 * - X-Content-Type-Options: nosniff
 * - X-Robots-Tag: noindex, nofollow
 *
 * Note: Les commandes sont des données sensibles privées
 * Support du paiement CASH avec statut "pending_cash"
 */
export const GET = withIntelligentRateLimit(
  async function (req) {
    try {
      // Vérifier l'authentification
      await isAuthenticatedUser(req, NextResponse);

      // Connexion DB
      await dbConnect();

      // Récupérer l'utilisateur avec validation améliorée
      const user = await User.findOne({ email: req.user.email })
        .select("_id name email phone isActive")
        .lean();

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

      // Vérifier si le compte est actif
      if (!user.isActive) {
        console.warn(
          "Inactive user attempting to access order history:",
          user.email,
        );
        return NextResponse.json(
          {
            success: false,
            message: "Account suspended. Cannot access order history",
            code: "ACCOUNT_SUSPENDED",
          },
          { status: 403 },
        );
      }

      // Récupérer et valider les paramètres de pagination
      const searchParams = req.nextUrl.searchParams;
      const page = parseInt(searchParams.get("page") || "1", 10);
      const resPerPage = 2; // 2 commandes par page

      // Validation des paramètres de pagination
      if (page < 1 || page > 1000) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid page number. Must be between 1 and 1000",
            code: "INVALID_PAGINATION",
            data: { page },
          },
          { status: 400 },
        );
      }

      // Compter le total de commandes avec les filtres
      const ordersCount = await Order.countDocuments({ user: user._id });
      const ordersPaidCount = await Order.countDocuments({
        user: user._id,
        paymentStatus: "paid",
      });
      const ordersUnpaidCount = await Order.countDocuments({
        user: user._id,
        paymentStatus: "unpaid",
      });
      const ordersPendingCashCount = await Order.countDocuments({
        user: user._id,
        paymentStatus: "pending_cash",
      });

      // Total de toutes les commandes d'un utilisateur (tous statuts confondus)
      const totalAmountOrders = await Order.getTotalAmountByUser(
        user._id.toString(),
      );

      // Si aucune commande trouvée
      if (ordersCount === 0) {
        return NextResponse.json(
          {
            success: true,
            message: "No orders found",
            data: {
              orders: [],
              totalPages: 0,
              currentPage: page,
              count: 0,
              perPage: resPerPage,
              paidCount: 0,
              unpaidCount: 0,
              pendingCashCount: 0,
              totalAmountOrders: { totalAmount: 0, orderCount: 0 },
              meta: {
                hasOrders: false,
                timestamp: new Date().toISOString(),
              },
            },
          },
          { status: 200 },
        );
      }

      // Utiliser APIFilters pour la pagination
      const apiFilters = new APIFilters(
        Order.find({ user: user._id }),
        searchParams,
      ).pagination(resPerPage);

      // Récupérer les commandes avec pagination - CHAMPS ADAPTÉS AU MODÈLE
      const orders = await apiFilters.query
        .select(
          "orderNumber paymentInfo paymentStatus totalAmount createdAt updatedAt paidAt cancelledAt cancelReason orderItems",
        )
        .sort({ createdAt: -1 })
        .lean();

      // Calculer le nombre de pages
      const totalPages = Math.ceil(ordersCount / resPerPage);

      // Formater la réponse avec détection du paiement CASH
      const formattedOrders = orders.map((order) => {
        // Vérifier si c'est un paiement CASH
        const isCashPayment =
          order.paymentInfo?.typePayment === "CASH" ||
          order.paymentInfo?.isCashPayment === true;

        return {
          ...order,
          user: {
            name: user.name,
            email: user.email,
            phone: user.phone,
          },
          // Ajouter un flag pour identifier facilement les paiements CASH
          isCashPayment,
          // Ajouter un message descriptif pour le statut
          paymentStatusDescription: isCashPayment
            ? "Paiement en espèces à la récupération"
            : order.paymentStatus === "paid"
              ? "Payé"
              : order.paymentStatus === "unpaid"
                ? "Non payé"
                : order.paymentStatus === "processing"
                  ? "En traitement"
                  : order.paymentStatus === "pending_cash"
                    ? "En attente de paiement en espèces"
                    : "Statut inconnu",
        };
      });

      // Log pour audit (sans données sensibles)
      console.log("Order history accessed:", {
        userId: user._id,
        userEmail: user.email,
        ordersRetrieved: orders.length,
        cashOrders: formattedOrders.filter((o) => o.isCashPayment).length,
        page,
        timestamp: new Date().toISOString(),
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            orders: formattedOrders,
            totalPages,
            currentPage: page,
            count: ordersCount,
            paidCount: ordersPaidCount,
            unpaidCount: ordersUnpaidCount,
            pendingCashCount: ordersPendingCashCount,
            totalAmountOrders,
            perPage: resPerPage,
            meta: {
              hasCashOrders:
                formattedOrders.filter((o) => o.isCashPayment).length > 0,
              timestamp: new Date().toISOString(),
            },
          },
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Orders fetch error:", error.message);

      // Capturer seulement les vraies erreurs système
      if (!error.message?.includes("authentication")) {
        captureException(error, {
          tags: {
            component: "api",
            route: "orders/me/GET",
            user: req.user?.email,
          },
          extra: {
            page: req.nextUrl.searchParams.get("page"),
          },
        });
      }

      // Gestion détaillée des erreurs
      let status = 500;
      let message = "Failed to fetch orders history";
      let code = "INTERNAL_ERROR";

      if (error.message?.includes("authentication")) {
        status = 401;
        message = "Authentication failed";
        code = "AUTH_FAILED";
      } else if (error.name === "CastError") {
        status = 400;
        message = "Invalid request parameters";
        code = "INVALID_PARAMS";
      } else if (error.message?.includes("connection")) {
        status = 503;
        message = "Database connection error";
        code = "DB_CONNECTION_ERROR";
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
    action: "authenticatedRead", // 200 req/min pour utilisateurs authentifiés
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
          "[ORDERS_ME] Error extracting user from JWT:",
          error.message,
        );
        return {};
      }
    },
  },
);
