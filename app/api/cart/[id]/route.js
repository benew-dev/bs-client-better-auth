import { NextResponse } from "next/server";
import dbConnect from "@/backend/config/dbConnect";
import isAuthenticatedUser from "@/backend/middlewares/auth";
import Cart from "@/backend/models/cart";
import User from "@/backend/models/user";
// eslint-disable-next-line no-unused-vars
import Product from "@/backend/models/product";
import { captureException } from "@/monitoring/sentry";
import { withCartRateLimit } from "@/utils/rateLimit";

/**
 * DELETE /api/cart/[id]
 * Supprime un élément du panier
 * Rate limit: Configuration intelligente - cart.remove (50 req/min, ultra permissif, pas de blocage)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/cart/*
 */
export const DELETE = withCartRateLimit(
  async function (req, { params }) {
    try {
      // Vérifier l'authentification
      await isAuthenticatedUser(req, NextResponse);

      // Connexion DB
      await dbConnect();

      // Validation de l'ID
      const { id } = params;
      if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid cart item ID format",
            code: "INVALID_ID",
          },
          { status: 400 },
        );
      }

      // Récupérer l'utilisateur
      const user = await User.findOne({ email: req.user.email }).select("_id");
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

      // Vérifier que l'élément existe avec plus de détails
      const cartItem = await Cart.findById(id).populate(
        "product",
        "name price",
      );

      if (!cartItem) {
        return NextResponse.json(
          {
            success: false,
            message: "Cart item not found",
            code: "CART_ITEM_NOT_FOUND",
          },
          { status: 404 },
        );
      }

      // Vérifier la propriété
      if (cartItem.user.toString() !== user._id.toString()) {
        // Log de sécurité pour tentative de suppression non autorisée
        console.warn("🚨 Unauthorized cart deletion attempt:", {
          userId: user._id,
          cartItemId: id,
          cartItemOwnerId: cartItem.user,
          timestamp: new Date().toISOString(),
          ip:
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown",
        });

        return NextResponse.json(
          {
            success: false,
            message: "Unauthorized",
            code: "UNAUTHORIZED_DELETE",
          },
          { status: 403 },
        );
      }

      // Stocker les informations pour le log avant suppression
      const deletedItemInfo = {
        productId: cartItem.product?._id,
        productName: cartItem.product?.name,
        quantity: cartItem.quantity,
        price: cartItem.product?.price,
      };

      // Supprimer l'élément
      await Cart.findByIdAndDelete(id);

      // Récupérer le panier mis à jour avec les produits populés
      const cartItems = await Cart.find({ user: user._id })
        .populate("product", "name price stock images isActive")
        .sort({ createdAt: -1 })
        .lean();

      // Filtrer et formater la réponse avec vérifications améliorées
      const formattedCart = cartItems
        .filter((item) => {
          return (
            item.product &&
            item.product.isActive !== false &&
            item.product.stock > 0
          );
        })
        .map((item) => {
          const adjustedQuantity = Math.min(item.quantity, item.product.stock);
          const subtotal = adjustedQuantity * item.product.price;

          return {
            id: item._id,
            productId: item.product._id,
            productName: item.product.name,
            price: item.product.price,
            quantity: adjustedQuantity,
            stock: item.product.stock,
            subtotal,
            imageUrl: item.product.images?.[0]?.url || "",
            meta: {
              adjusted: adjustedQuantity !== item.quantity,
              originalQuantity: item.quantity,
            },
          };
        });

      const cartCount = formattedCart.length;
      const cartTotal = formattedCart.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );

      // Log de sécurité pour audit
      console.log("🔒 Security event - Cart item deleted:", {
        userId: user._id,
        cartItemId: id,
        deletedItem: deletedItemInfo,
        remainingItems: cartCount,
        timestamp: new Date().toISOString(),
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      });

      return NextResponse.json(
        {
          success: true,
          message: "Item removed from cart successfully",
          data: {
            cartCount,
            cartTotal,
            cart: formattedCart,
            deletedItem: {
              id,
              productName: deletedItemInfo.productName,
              quantity: deletedItemInfo.quantity,
            },
            meta: {
              hasAdjustments: formattedCart.some((item) => item.meta?.adjusted),
              timestamp: new Date().toISOString(),
            },
          },
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Cart delete error:", error.message);

      if (error.name !== "CastError" && error.name !== "ValidationError") {
        captureException(error, {
          tags: {
            component: "api",
            route: "cart/[id]/DELETE",
            user: req.user?.email,
            cartItemId: params.id,
          },
        });
      }

      let status = 500;
      let message = "Something went wrong";
      let code = "INTERNAL_ERROR";

      if (error.name === "CastError") {
        status = 400;
        message = "Invalid cart item ID format";
        code = "INVALID_ID_FORMAT";
      } else if (error.name === "ValidationError") {
        status = 400;
        message = "Validation error";
        code = "VALIDATION_ERROR";
      } else if (error.message?.includes("authentication")) {
        status = 401;
        message = "Authentication failed";
        code = "AUTH_FAILED";
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
    action: "remove", // 50 req/min, pas de blocage
  },
);
