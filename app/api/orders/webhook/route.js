import { NextResponse } from "next/server";
import dbConnect from "@/backend/config/dbConnect";
import Order from "@/backend/models/order";
import Product from "@/backend/models/product";
import Category from "@/backend/models/category";
import Cart from "@/backend/models/cart";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import {
  extractUserInfoFromRequest,
  isAuthenticatedUser,
} from "@/lib/auth-utils";

/**
 * POST /api/orders/webhook
 * Crée une commande après paiement confirmé (ou avec paiement CASH en attente)
 * Rate limit: 5 commandes par 10 minutes (protection anti-abus strict)
 * Adapté pour ~500 visiteurs/jour
 *
 * Support du paiement CASH:
 * - Pas de validation des champs de compte pour CASH
 * - Statut initial: "pending_cash"
 * - Informations de paiement: "CASH" / "Paiement en espèces"
 */
export const POST = withIntelligentRateLimit(
  async function (req) {
    try {
      // 1. Authentification
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

      // Vérifier si le compte est actif
      if (!user.isActive) {
        console.warn("Inactive user attempting to place order:", user.email);
        return NextResponse.json(
          {
            success: false,
            message: "Account suspended. Cannot place orders",
            code: "ACCOUNT_SUSPENDED",
          },
          { status: 403 },
        );
      }

      // 2. Connexion DB
      await dbConnect();

      // 4. Parser et valider les données de commande
      let orderData;
      try {
        orderData = await req.json();
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid request body",
            code: "INVALID_BODY",
          },
          { status: 400 },
        );
      }

      // Validation basique des champs requis
      if (!orderData?.orderItems?.length) {
        return NextResponse.json(
          {
            success: false,
            message: "Order must contain at least one item",
            code: "EMPTY_ORDER",
          },
          { status: 400 },
        );
      }

      if (!orderData.paymentInfo) {
        return NextResponse.json(
          {
            success: false,
            message: "Payment information is required",
            code: "MISSING_PAYMENT_INFO",
          },
          { status: 400 },
        );
      }

      // Validation du paiement avec support CASH
      const {
        typePayment,
        paymentAccountNumber,
        paymentAccountName,
        isCashPayment,
      } = orderData.paymentInfo || {};

      if (!typePayment) {
        return NextResponse.json(
          { success: false, message: "Payment type is required" },
          { status: 400 },
        );
      }

      // Vérifier si c'est un paiement CASH
      const isCash = typePayment === "CASH" || isCashPayment === true;

      // Pour les paiements non-CASH, vérifier les informations de compte
      if (!isCash && (!paymentAccountNumber || !paymentAccountName)) {
        return NextResponse.json(
          {
            success: false,
            message: "Account information required for non-cash payments",
          },
          { status: 400 },
        );
      }

      // Pour CASH, normaliser les informations
      if (isCash) {
        orderData.paymentInfo.paymentAccountNumber = "CASH";
        orderData.paymentInfo.paymentAccountName = "Paiement en espèces";
        orderData.paymentInfo.isCashPayment = true;
      }

      // 5. Vérifier le stock et traiter la commande en transaction
      const session = await Order.startSession();

      try {
        await session.withTransaction(async () => {
          // Extraire les IDs de produits et quantités
          const productOrders = orderData.orderItems.map((item) => ({
            productId: item.product,
            quantity: parseInt(item.quantity, 10),
            cartId: item.cartId,
            price: parseFloat(item.price),
          }));

          // Vérifier et mettre à jour le stock pour chaque produit
          const unavailableProducts = [];
          const processedItems = [];

          for (const item of productOrders) {
            const product = await Product.findById(item.productId)
              .select("name stock price category isActive")
              .populate("category", "categoryName")
              .session(session);

            if (!product) {
              unavailableProducts.push({
                id: item.productId,
                name: "Product not found",
                reason: "not_found",
              });
              continue;
            }

            // Vérifier si le produit est actif
            if (!product.isActive) {
              unavailableProducts.push({
                id: product._id,
                name: product.name,
                reason: "product_inactive",
              });
              continue;
            }

            // Vérifier le stock
            if (product.stock < item.quantity) {
              unavailableProducts.push({
                id: product._id,
                name: product.name,
                stock: product.stock,
                requested: item.quantity,
                reason: "insufficient_stock",
              });
              continue;
            }

            // Vérifier le prix (protection contre la manipulation)
            if (Math.abs(product.price - item.price) > 0.01) {
              console.warn("Price mismatch detected:", {
                productId: product._id,
                expectedPrice: product.price,
                providedPrice: item.price,
                userId: user.id,
              });

              unavailableProducts.push({
                id: product._id,
                name: product.name,
                reason: "price_mismatch",
                expected: product.price,
                provided: item.price,
              });
              continue;
            }

            // Mettre à jour le stock
            await Product.findByIdAndUpdate(
              product._id,
              {
                $inc: {
                  stock: -item.quantity,
                  sold: item.quantity, // Incrémenter les ventes
                },
              },
              { session },
            );

            // Ajouter la catégorie à l'item de commande
            const orderItem = orderData.orderItems.find(
              (oi) => oi.product.toString() === product._id.toString(),
            );
            if (orderItem && product.category) {
              orderItem.category = product.category.categoryName;
            }

            processedItems.push({
              productId: product._id,
              productName: product.name,
              quantity: item.quantity,
              price: product.price,
            });
          }

          // Si des produits ne sont pas disponibles, annuler la transaction
          if (unavailableProducts.length > 0) {
            throw new Error(
              JSON.stringify({
                type: "STOCK_ERROR",
                products: unavailableProducts,
              }),
            );
          }

          // Nettoyer les champs non nécessaires
          orderData.orderItems.forEach((item) => {
            delete item.cartId;
          });

          // Ajouter des métadonnées à la commande
          orderData.user = user.id;

          // Créer la commande
          const order = await Order.create([orderData], { session });

          // Supprimer les articles du panier
          const cartIds = productOrders
            .filter((item) => item.cartId)
            .map((item) => item.cartId);

          if (cartIds.length > 0) {
            const deleteResult = await Cart.deleteMany(
              { _id: { $in: cartIds }, user: user.id },
              { session },
            );

            console.log(
              `Cleared ${deleteResult.deletedCount} items from cart for user ${user.id}`,
            );
          }

          // La transaction sera automatiquement commitée si tout réussit
          return order[0];
        });

        // Transaction réussie - Récupérer la commande complète
        const order = await Order.findOne({ user: user.id })
          .sort({ createdAt: -1 })
          .select("_id orderNumber paymentStatus")
          .lean();

        // Log de sécurité pour audit avec info CASH
        console.log("🔒 Security event - Order created:", {
          userId: user.id,
          userEmail: user.email,
          orderId: order._id,
          orderNumber: order.orderNumber,
          totalAmount: orderData.totalAmount,
          paymentType: typePayment,
          isCashPayment: isCash,
          paymentStatus: order.paymentStatus,
          itemCount: orderData.orderItems.length,
          timestamp: new Date().toISOString(),
          ip:
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown",
        });

        return NextResponse.json(
          {
            success: true,
            id: order.orderNumber,
            orderNumber: order.orderNumber,
            message: isCash
              ? "Order placed successfully - Cash payment on pickup"
              : "Order placed successfully",
            isCashPayment: isCash,
            paymentStatus: order.paymentStatus,
          },
          { status: 201 },
        );
      } catch (transactionError) {
        // Gérer les erreurs de transaction
        if (transactionError.message?.includes("STOCK_ERROR")) {
          try {
            const errorData = JSON.parse(transactionError.message);

            // Log pour analyse
            console.warn("Order failed due to stock issues:", {
              userId: user.id,
              unavailableProducts: errorData.products,
              timestamp: new Date().toISOString(),
            });

            return NextResponse.json(
              {
                success: false,
                message: "Some products are unavailable",
                code: "STOCK_ERROR",
                unavailableProducts: errorData.products,
              },
              { status: 409 },
            );
          } catch {
            // Fallback si le parsing échoue
          }
        }

        // Log de l'erreur de transaction
        console.error("Transaction failed:", {
          userId: user.id,
          error: transactionError.message,
          timestamp: new Date().toISOString(),
        });

        // Autre erreur de transaction
        throw transactionError;
      } finally {
        await session.endSession();
      }
    } catch (error) {
      console.error("Order webhook error:", error.message);

      // Capturer seulement les vraies erreurs système
      if (
        !error.message?.includes("authentication") &&
        !error.message?.includes("STOCK_ERROR") &&
        !error.message?.includes("PAYMENT_")
      ) {
        captureException(error, {
          tags: {
            component: "api",
            route: "orders/webhook/POST",
            user: req.user?.email,
            critical: true, // Erreur critique car c'est une commande
          },
          level: "error",
        });
      }

      // Gestion détaillée des erreurs
      let status = 500;
      let message = "Failed to process order. Please try again.";
      let code = "INTERNAL_ERROR";

      if (error.message?.includes("authentication")) {
        status = 401;
        message = "Authentication failed";
        code = "AUTH_FAILED";
      } else if (error.message?.includes("MongoNetwork")) {
        status = 503;
        message = "Database connection error. Please try again";
        code = "DB_CONNECTION_ERROR";
      } else if (error.message?.includes("timeout")) {
        status = 504;
        message = "Request timeout. Please try again";
        code = "TIMEOUT";
      } else if (error.message?.includes("Transaction")) {
        status = 500;
        message = "Transaction failed. No charges were made";
        code = "TRANSACTION_FAILED";
      }

      return NextResponse.json(
        {
          success: false,
          message,
          code,
          ...(process.env.NODE_ENV === "development" && {
            error: error.message,
            stack: error.stack,
          }),
        },
        { status },
      );
    }
  },
  {
    category: "payment",
    action: "createOrder", // 5 commandes par 5 minutes
    extractUserInfo: extractUserInfoFromRequest, // ✅ Remplacer la fonction personnalisée
  },
);
