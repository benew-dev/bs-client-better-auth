import { NextResponse } from "next/server";
import dbConnect from "@/backend/config/dbConnect";
import isAuthenticatedUser from "@/backend/middlewares/auth";
import User from "@/backend/models/user";
import Cart from "@/backend/models/cart";
import Product from "@/backend/models/product";
import { DECREASE, INCREASE } from "@/helpers/constants";
import { captureException } from "@/monitoring/sentry";
import { withCartRateLimit, withIntelligentRateLimit } from "@/utils/rateLimit";
import { getToken } from "next-auth/jwt";

/**
 * GET /api/cart
 * Récupère le panier de l'utilisateur connecté
 * Rate limit: Configuration intelligente - authenticatedRead (200 req/min pour utilisateurs authentifiés)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/cart/*
 */
export const GET = withIntelligentRateLimit(
  async function (req) {
    try {
      // Vérifier l'authentification
      await isAuthenticatedUser(req, NextResponse);

      // Connexion DB
      await dbConnect();

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

      // Récupérer le panier avec les produits populés
      const cartItems = await Cart.find({ user: user._id })
        .populate("product", "name price stock images isActive")
        .lean();

      // Filtrer les produits disponibles et ajuster les quantités
      const validCartItems = cartItems.filter(
        (item) =>
          item.product && item.product.isActive && item.product.stock > 0,
      );

      // Ajuster les quantités si elles dépassent le stock
      const formattedCart = validCartItems.map((item) => {
        const quantity = Math.min(item.quantity, item.product.stock);
        const subtotal = quantity * item.product.price;

        return {
          id: item._id,
          productId: item.product._id,
          productName: item.product.name,
          price: item.product.price,
          quantity,
          stock: item.product.stock,
          subtotal,
          imageUrl: item.product.images?.[0]?.url || "",
          meta: {
            adjusted: quantity !== item.quantity,
            originalQuantity: item.quantity,
          },
        };
      });

      const cartCount = formattedCart.length;
      const cartTotal = formattedCart.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );

      return NextResponse.json(
        {
          success: true,
          data: {
            cartCount,
            cartTotal,
            cart: formattedCart,
            meta: {
              timestamp: new Date().toISOString(),
              hasAdjustments: formattedCart.some((item) => item.meta?.adjusted),
            },
          },
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Cart GET error:", error.message);

      if (!error.message?.includes("authentication")) {
        captureException(error, {
          tags: {
            component: "api",
            route: "cart/GET",
            user: req.user?.email,
          },
        });
      }

      return NextResponse.json(
        {
          success: false,
          message: error.message?.includes("authentication")
            ? "Authentication failed"
            : "Failed to fetch cart",
          code: error.message?.includes("authentication")
            ? "AUTH_FAILED"
            : "FETCH_ERROR",
        },
        { status: error.message?.includes("authentication") ? 401 : 500 },
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
          "[CART_GET] Error extracting user from JWT:",
          error.message,
        );
        return {};
      }
    },
  },
);

/**
 * POST /api/cart
 * Ajoute un produit au panier
 * Rate limit: Configuration intelligente - cart.add (100 req/min, ultra permissif)
 */
export const POST = withCartRateLimit(
  async function (req) {
    try {
      // Vérifier l'authentification
      await isAuthenticatedUser(req, NextResponse);

      // Connexion DB
      await dbConnect();

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

      // Parser les données
      let body;
      try {
        body = await req.json();
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

      const { productId, quantity = 1 } = body;

      // Validation basique
      if (!productId || !/^[0-9a-fA-F]{24}$/.test(productId)) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid product ID",
            code: "INVALID_PRODUCT_ID",
          },
          { status: 400 },
        );
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid quantity. Must be between 1 and 99",
            code: "INVALID_QUANTITY",
            data: { min: 1, max: 99, provided: quantity },
          },
          { status: 400 },
        );
      }

      // Vérifier le produit
      const product = await Product.findById(productId)
        .select("name price stock isActive")
        .lean();

      if (!product) {
        return NextResponse.json(
          {
            success: false,
            message: "Product not found",
            code: "PRODUCT_NOT_FOUND",
          },
          { status: 404 },
        );
      }

      if (!product.isActive) {
        return NextResponse.json(
          {
            success: false,
            message: "Product is not available",
            code: "PRODUCT_INACTIVE",
          },
          { status: 400 },
        );
      }

      if (product.stock === 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Product is out of stock",
            code: "OUT_OF_STOCK",
          },
          { status: 400 },
        );
      }

      if (quantity > product.stock) {
        return NextResponse.json(
          {
            success: false,
            message: `Only ${product.stock} units available`,
            code: "INSUFFICIENT_STOCK",
            data: { available: product.stock, requested: quantity },
          },
          { status: 400 },
        );
      }

      // Vérifier si le produit est déjà dans le panier
      const existingCartItem = await Cart.findOne({
        user: user._id,
        product: productId,
      });

      let updatedItem;
      let isNewItem = false;

      if (existingCartItem) {
        // Mettre à jour la quantité
        const newQuantity = Math.min(
          existingCartItem.quantity + quantity,
          product.stock,
        );

        existingCartItem.quantity = newQuantity;
        await existingCartItem.save();
        updatedItem = existingCartItem;
      } else {
        // Créer un nouvel item
        isNewItem = true;
        updatedItem = await Cart.create({
          user: user._id,
          product: productId,
          quantity: Math.min(quantity, product.stock),
          price: product.price,
          productName: product.name,
        });
      }

      // Récupérer le panier mis à jour
      const cartItems = await Cart.find({ user: user._id })
        .populate("product", "name price stock images isActive")
        .lean();

      // Formater la réponse
      const formattedCart = cartItems
        .filter((item) => item.product && item.product.isActive)
        .map((item) => ({
          id: item._id,
          productId: item.product._id,
          productName: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          stock: item.product.stock,
          subtotal: item.quantity * item.product.price,
          imageUrl: item.product.images?.[0]?.url || "",
        }));

      const cartCount = formattedCart.length;
      const cartTotal = formattedCart.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );

      // Log de sécurité pour audit
      console.log("🔒 Security event - Cart item added:", {
        userId: user._id,
        productId,
        quantity: updatedItem.quantity,
        isNewItem,
        timestamp: new Date().toISOString(),
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      });

      return NextResponse.json(
        {
          success: true,
          message: isNewItem
            ? "Product added to cart"
            : "Cart quantity updated",
          data: {
            cartCount,
            cartTotal,
            cart: formattedCart,
            addedItem: {
              productId,
              quantity: updatedItem.quantity,
              isNewItem,
            },
          },
        },
        { status: isNewItem ? 201 : 200 },
      );
    } catch (error) {
      console.error("Cart POST error:", error.message);

      if (error.code !== 11000 && !error.message?.includes("authentication")) {
        captureException(error, {
          tags: {
            component: "api",
            route: "cart/POST",
            user: req.user?.email,
          },
        });
      }

      let status = 500;
      let message = "Failed to add to cart";
      let code = "INTERNAL_ERROR";

      if (error.code === 11000) {
        status = 409;
        message = "Product already in cart";
        code = "DUPLICATE_ITEM";
      } else if (error.message?.includes("authentication")) {
        status = 401;
        message = "Authentication failed";
        code = "AUTH_FAILED";
      }

      return NextResponse.json({ success: false, message, code }, { status });
    }
  },
  {
    action: "add", // 100 req/min, pas de blocage
  },
);

/**
 * PUT /api/cart
 * Met à jour la quantité d'un produit dans le panier
 * Rate limit: Configuration intelligente - cart.update (100 req/min, ultra permissif)
 */
export const PUT = withCartRateLimit(
  async function (req) {
    try {
      // Vérifier l'authentification
      await isAuthenticatedUser(req, NextResponse);

      // Connexion DB
      await dbConnect();

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

      // Parser les données
      let body;
      try {
        body = await req.json();
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

      const cartItemId = body.product?.id;
      const action = body.value;

      // Validation
      if (!cartItemId || !/^[0-9a-fA-F]{24}$/.test(cartItemId)) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid cart item ID",
            code: "INVALID_CART_ITEM_ID",
          },
          { status: 400 },
        );
      }

      if (action !== INCREASE && action !== DECREASE) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid action. Must be INCREASE or DECREASE",
            code: "INVALID_ACTION",
            data: { validActions: [INCREASE, DECREASE] },
          },
          { status: 400 },
        );
      }

      // Récupérer l'item du panier
      const cartItem = await Cart.findOne({
        _id: cartItemId,
        user: user._id,
      }).populate("product", "stock isActive name price");

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

      // Vérifier que le produit est toujours disponible
      if (!cartItem.product || !cartItem.product.isActive) {
        await Cart.findByIdAndDelete(cartItemId);

        return NextResponse.json(
          {
            success: false,
            message: "Product no longer available",
            code: "PRODUCT_UNAVAILABLE",
            data: { itemRemoved: true },
          },
          { status: 400 },
        );
      }

      // Variables pour le log
      const previousQuantity = cartItem.quantity;
      let itemDeleted = false;

      // Mettre à jour la quantité
      if (action === INCREASE) {
        const newQuantity = cartItem.quantity + 1;

        if (newQuantity > cartItem.product.stock) {
          return NextResponse.json(
            {
              success: false,
              message: `Only ${cartItem.product.stock} units available`,
              code: "INSUFFICIENT_STOCK",
              data: {
                current: cartItem.quantity,
                available: cartItem.product.stock,
              },
            },
            { status: 400 },
          );
        }

        cartItem.quantity = newQuantity;
        await cartItem.save();
      } else if (action === DECREASE) {
        const newQuantity = cartItem.quantity - 1;

        if (newQuantity <= 0) {
          await Cart.findByIdAndDelete(cartItemId);
          itemDeleted = true;
        } else {
          cartItem.quantity = newQuantity;
          await cartItem.save();
        }
      }

      // Récupérer le panier mis à jour
      const cartItems = await Cart.find({ user: user._id })
        .populate("product", "name price stock images isActive")
        .lean();

      // Formater la réponse
      const formattedCart = cartItems
        .filter((item) => item.product && item.product.isActive)
        .map((item) => ({
          id: item._id,
          productId: item.product._id,
          productName: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          stock: item.product.stock,
          subtotal: item.quantity * item.product.price,
          imageUrl: item.product.images?.[0]?.url || "",
        }));

      const cartCount = formattedCart.length;
      const cartTotal = formattedCart.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );

      // Log de sécurité pour audit
      console.log("🔒 Security event - Cart quantity updated:", {
        userId: user._id,
        cartItemId,
        action,
        previousQuantity,
        newQuantity: itemDeleted ? 0 : cartItem.quantity,
        itemDeleted,
        timestamp: new Date().toISOString(),
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      });

      return NextResponse.json(
        {
          success: true,
          message: itemDeleted
            ? "Item removed from cart"
            : `Cart ${action === INCREASE ? "increased" : "decreased"} successfully`,
          data: {
            cartCount,
            cartTotal,
            cart: formattedCart,
            updatedItem: {
              cartItemId,
              action,
              deleted: itemDeleted,
              newQuantity: itemDeleted ? 0 : cartItem.quantity,
            },
          },
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Cart PUT error:", error.message);

      if (error.name !== "ValidationError" && error.name !== "CastError") {
        captureException(error, {
          tags: {
            component: "api",
            route: "cart/PUT",
            user: req.user?.email,
          },
        });
      }

      let status = 500;
      let message = "Failed to update cart";
      let code = "INTERNAL_ERROR";

      if (error.name === "ValidationError") {
        status = 400;
        message = "Invalid cart data";
        code = "VALIDATION_ERROR";
      } else if (error.name === "CastError") {
        status = 400;
        message = "Invalid ID format";
        code = "INVALID_ID_FORMAT";
      }

      return NextResponse.json({ success: false, message, code }, { status });
    }
  },
  {
    action: "update", // 100 req/min, pas de blocage
  },
);
