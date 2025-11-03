"use client";

import {
  createContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { toast } from "react-toastify";
import { DECREASE, INCREASE } from "@/helpers/constants";
import captureClientError from "@/monitoring/sentry";
import { useSession } from "@/lib/auth-client";

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [error, setError] = useState(null);

  // ✅ Flag pour éviter les chargements multiples
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  // ✅ Charger le panier automatiquement UNE SEULE FOIS quand la session est disponible
  useEffect(() => {
    if (session?.user && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setCartToState();
    } else if (!session?.user) {
      // Réinitialiser quand l'utilisateur se déconnecte
      clearCartOnLogout();
      hasLoadedRef.current = false;
    }
  }, [session?.user?.id]);

  // Récupérer le panier
  const setCartToState = useCallback(async () => {
    // ✅ Empêcher les appels multiples simultanés
    if (isLoadingRef.current) {
      console.log("Cart loading already in progress, skipping...");
      return;
    }

    if (!session?.user) {
      console.log("No session available, skipping cart load");
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: controller.signal,
        credentials: "include",
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        let errorMessage = "";
        switch (res.status) {
          case 401:
            errorMessage = "Session expirée. Veuillez vous reconnecter";
            break;
          case 429:
            errorMessage = "Trop de tentatives. Réessayez plus tard.";
            break;
          default:
            errorMessage =
              data.message || "Erreur lors de la récupération du panier";
        }

        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        const isCritical = res.status === 401;
        captureClientError(
          httpError,
          "CartContext",
          "setCartToState",
          isCritical,
        );

        setError(errorMessage);
        return;
      }

      if (data.success) {
        remoteDataInState(data);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        setError("La requête a pris trop de temps");
        captureClientError(error, "CartContext", "setCartToState", false);
      } else {
        setError("Problème de connexion. Vérifiez votre connexion.");
        captureClientError(error, "CartContext", "setCartToState", true);
      }
      console.error("Cart retrieval error:", error.message);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [session?.user]);

  // Ajouter au panier - SIMPLIFIÉ (40 lignes max)
  const addItemToCart = async ({ product, quantity = 1 }) => {
    // ✅ Vérifier la session avant l'action
    if (!session?.user) {
      toast.error("Veuillez vous connecter pour ajouter au panier");
      return;
    }

    try {
      if (!product) {
        const validationError = new Error("Produit invalide");
        captureClientError(
          validationError,
          "CartContext",
          "addItemToCart",
          false,
        );
        toast.error("Produit invalide");
        return;
      }

      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          productId: product,
          quantity: parseInt(quantity, 10),
        }),
        signal: controller.signal,
        credentials: "include",
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        let errorMessage = "";
        let toastMessage = "";
        switch (res.status) {
          case 400:
            errorMessage = data.message || "Stock insuffisant";
            toastMessage = data.message || "Stock insuffisant";
            break;
          case 401:
            errorMessage = "Veuillez vous connecter";
            toastMessage = "Veuillez vous connecter";
            break;
          case 409:
            errorMessage = "Produit déjà dans le panier";
            toastMessage = "Produit déjà dans le panier";
            break;
          default:
            errorMessage = data.message || "Erreur lors de l'ajout";
            toastMessage = data.message || "Erreur lors de l'ajout";
        }

        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        const isCritical = res.status === 401;
        captureClientError(
          httpError,
          "CartContext",
          "addItemToCart",
          isCritical,
        );

        if (res.status === 409) {
          toast.info(toastMessage);
        } else {
          toast.error(toastMessage);
        }
        return;
      }

      if (data.success) {
        await setCartToState();
        toast.success("Produit ajouté au panier");
      }
    } catch (error) {
      if (error.name === "AbortError") {
        toast.error("La connexion est trop lente");
        captureClientError(error, "CartContext", "addItemToCart", false);
      } else {
        toast.error("Problème de connexion");
        captureClientError(error, "CartContext", "addItemToCart", true);
      }
      console.error("Add to cart error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Mettre à jour quantité - SIMPLIFIÉ (40 lignes max)
  const updateCart = async (product, action) => {
    // ✅ Vérifier la session avant l'action
    if (!session?.user) {
      toast.error("Veuillez vous connecter");
      return;
    }

    try {
      if (!product?.id || ![INCREASE, DECREASE].includes(action)) {
        const validationError = new Error(
          "Données invalides pour mise à jour panier",
        );
        captureClientError(validationError, "CartContext", "updateCart", false);
        toast.error("Données invalides");
        return;
      }

      if (action === DECREASE && product.quantity === 1) {
        toast.info("Utilisez le bouton Supprimer pour retirer cet article");
        return;
      }

      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          product,
          value: action,
        }),
        signal: controller.signal,
        credentials: "include",
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data.message || "Erreur de mise à jour";

        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        const isCritical = res.status === 401;
        captureClientError(httpError, "CartContext", "updateCart", isCritical);

        toast.error(errorMessage);
        return;
      }

      if (data.success) {
        await setCartToState();
        toast.success(
          action === INCREASE ? "Quantité augmentée" : "Quantité diminuée",
        );
      }
    } catch (error) {
      if (error.name === "AbortError") {
        toast.error("La connexion est trop lente");
        captureClientError(error, "CartContext", "updateCart", false);
      } else {
        toast.error("Problème de connexion");
        captureClientError(error, "CartContext", "updateCart", true);
      }
      console.error("Update cart error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Supprimer du panier - SIMPLIFIÉ (30 lignes max)
  const deleteItemFromCart = async (id) => {
    // ✅ Vérifier la session avant l'action
    if (!session?.user) {
      toast.error("Veuillez vous connecter");
      return;
    }

    try {
      if (!id) {
        const validationError = new Error(
          "ID invalide pour suppression panier",
        );
        captureClientError(
          validationError,
          "CartContext",
          "deleteItemFromCart",
          false,
        );
        toast.error("ID invalide");
        return;
      }

      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/cart/${id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: controller.signal,
          credentials: "include",
        },
      );

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data.message || "Erreur de suppression";

        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        const isCritical = [401, 404].includes(res.status);
        captureClientError(
          httpError,
          "CartContext",
          "deleteItemFromCart",
          isCritical,
        );

        toast.error(errorMessage);
        return;
      }

      if (data.success) {
        await setCartToState();
        toast.success("Article supprimé");
      }
    } catch (error) {
      if (error.name === "AbortError") {
        toast.error("La connexion est trop lente");
        captureClientError(error, "CartContext", "deleteItemFromCart", false);
      } else {
        toast.error("Problème de connexion");
        captureClientError(error, "CartContext", "deleteItemFromCart", true);
      }
      console.error("Delete cart item error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const clearCartOnLogout = () => {
    setCart([]);
    setLoading(false);
    setCartCount(0);
    setCartTotal(0);
  };

  const remoteDataInState = (response) => {
    try {
      const normalizedCart =
        response.data.cart?.map((item) => ({
          ...item,
          quantity: parseInt(item.quantity, 10) || 1,
        })) || [];

      setCart(normalizedCart);
      setCartCount(response.data.cartCount || 0);
      setCartTotal(response.data.cartTotal || 0);
    } catch (error) {
      captureClientError(error, "CartContext", "remoteDataInState", true);
      console.error("Error normalizing cart data:", error.message);

      setCart([]);
      setCartCount(0);
      setCartTotal(0);
    }
  };

  const contextValue = useMemo(
    () => ({
      loading,
      cart,
      cartCount,
      cartTotal,
      error,
      setCartToState,
      addItemToCart,
      updateCart,
      deleteItemFromCart,
      clearError,
      clearCartOnLogout,
    }),
    [loading, cart, cartCount, cartTotal, error, setCartToState],
  );

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  );
};

export default CartContext;
