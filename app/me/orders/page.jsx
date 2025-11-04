import { lazy, Suspense } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { captureException } from "@/monitoring/sentry";

import logger from "@/utils/logger";
import { getCookieName } from "@/helpers/helpers";
import { getAuthenticatedUser } from "@/lib/auth";

// Ajoutez après les imports
export const dynamic = "force-dynamic";

// Chargement dynamique avec fallback
const ListOrders = lazy(() => import("@/components/orders/ListOrders"));

/**
 * Récupère l'historique des commandes de l'utilisateur connecté
 * Adapté au nouveau modèle Order
 */
const getAllOrders = async (searchParams) => {
  const requestId = `orderspage-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .substring(2, 7)}`;

  // Première vérification d'authentification
  const headersList = await headers();
  const user = await getAuthenticatedUser(headersList);

  if (!user) {
    logger.warn(
      "Unauthenticated access to orders page (getAuthenticatedUser)",
      {
        requestId,
        action: "unauthenticated_access_primary",
      },
    );
    return redirect("/login?callbackUrl=/me/orders");
  }

  logger.info("Orders page accessed", {
    requestId,
    page: searchParams?.page || 1,
    userId: user._id
      ? `${user._id.substring(0, 2)}...${user._id.slice(-2)}`
      : "unknown",
    action: "orders_page_access",
  });

  try {
    // 1. Obtenir le cookie d'authentification
    const nextCookies = await cookies();
    const cookieName = getCookieName();
    const authToken = nextCookies.get(cookieName);

    // 2. Vérifier l'authentification
    if (!authToken) {
      console.warn("No authentication token found");
      return {
        success: false,
        message: "Authentification requise",
        data: {
          orders: [],
          totalPages: 0,
          currentPage: 1,
          count: 0,
          paidCount: 0,
          unpaidCount: 0,
          totalAmountOrders: { totalAmount: 0, orderCount: 0 },
        },
      };
    }

    // 3. Valider et construire les paramètres de pagination
    const urlParams = {};

    if (searchParams?.page) {
      const parsedPage = parseInt(searchParams.page, 10);
      if (!isNaN(parsedPage) && parsedPage > 0 && parsedPage <= 100) {
        urlParams.page = parsedPage;
      } else {
        console.warn("Invalid page parameter:", searchParams.page);
        urlParams.page = 1;
      }
    }

    // 4. Construire l'URL de l'API
    const searchQuery = new URLSearchParams(urlParams).toString();
    const apiUrl = `${
      process.env.API_URL || "https://buyitnow-next15-client-bs.vercel.app"
    }/api/orders/me${searchQuery ? `?${searchQuery}` : ""}`;

    console.log("Fetching orders from:", apiUrl);

    // 5. Faire l'appel API avec timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${authToken.name}=${authToken.value}`,
      },
      next: {
        revalidate: 0,
        tags: ["user-orders"],
      },
    });

    clearTimeout(timeoutId);

    // 6. Vérifier le statut HTTP
    if (!res.ok) {
      if (res.status === 401) {
        return {
          success: false,
          message: "Authentification requise",
          data: {
            orders: [],
            totalPages: 0,
            currentPage: 1,
            count: 0,
            paidCount: 0,
            unpaidCount: 0,
            totalAmountOrders: { totalAmount: 0, orderCount: 0 },
          },
        };
      }

      if (res.status === 404) {
        return {
          success: true,
          message: "Aucune commande trouvée",
          data: {
            orders: [],
            totalPages: 0,
            currentPage: urlParams.page || 1,
            count: 0,
            paidCount: 0,
            unpaidCount: 0,
            totalAmountOrders: { totalAmount: 0, orderCount: 0 },
          },
        };
      }

      console.error(`API Error: ${res.status} - ${res.statusText}`);
      return {
        success: false,
        message: "Erreur lors de la récupération des commandes",
        data: {
          orders: [],
          totalPages: 0,
          currentPage: 1,
          count: 0,
          paidCount: 0,
          unpaidCount: 0,
          totalAmountOrders: { totalAmount: 0, orderCount: 0 },
        },
      };
    }

    // 7. Parser la réponse JSON
    const responseBody = await res.json();

    // 8. Vérifier la structure de la réponse
    if (!responseBody.success || !responseBody.data) {
      console.error("Invalid API response structure:", responseBody);
      return {
        success: false,
        message: responseBody.message || "Réponse API invalide",
        data: {
          orders: [],
          totalPages: 0,
          currentPage: 1,
          count: 0,
          paidCount: 0,
          unpaidCount: 0,
          totalAmountOrders: { totalAmount: 0, orderCount: 0 },
        },
      };
    }

    // 9. Masquer les informations sensibles de paiement
    const sanitizedOrders = (responseBody.data.orders || []).map((order) => ({
      ...order,
      paymentInfo: order.paymentInfo
        ? {
            ...order.paymentInfo,
            paymentAccountNumber: order.paymentInfo.paymentAccountNumber,
          }
        : order.paymentInfo,
    }));

    // 10. Retourner les données avec succès
    return {
      success: true,
      message:
        responseBody.data.count > 0
          ? "Commandes récupérées avec succès"
          : "Aucune commande trouvée",
      data: {
        orders: sanitizedOrders,
        totalPages: responseBody.data.totalPages || 0,
        currentPage: responseBody.data.currentPage || urlParams.page || 1,
        count: responseBody.data.count || 0,
        perPage: responseBody.data.perPage || 2,
        paidCount: responseBody.data.paidCount || 0,
        unpaidCount: responseBody.data.unpaidCount || 0,
        totalAmountOrders: responseBody.data.totalAmountOrders || {
          totalAmount: 0,
          orderCount: 0,
        },
      },
    };
  } catch (error) {
    // 11. Gestion des erreurs réseau/timeout
    if (error.name === "AbortError") {
      console.error("Request timeout after 8 seconds");
      return {
        success: false,
        message: "La requête a pris trop de temps",
        data: {
          orders: [],
          totalPages: 0,
          currentPage: 1,
          count: 0,
          paidCount: 0,
          unpaidCount: 0,
          totalAmountOrders: { totalAmount: 0, orderCount: 0 },
        },
      };
    }

    console.error("Network error:", error.message);
    return {
      success: false,
      message: "Problème de connexion réseau",
      data: {
        orders: [],
        totalPages: 0,
        currentPage: 1,
        count: 0,
        paidCount: 0,
        unpaidCount: 0,
        totalAmountOrders: { totalAmount: 0, orderCount: 0 },
      },
    };
  }
};

// Composant de chargement dédié
const OrdersPageSkeleton = () => (
  <div className="animate-pulse p-4">
    <div className="h-7 bg-gray-200 rounded w-48 mb-6"></div>
    {[...Array(3)].map((_, i) => (
      <div key={i} className="mb-6">
        <div className="h-64 bg-gray-200 rounded-md mb-3"></div>
      </div>
    ))}
  </div>
);

// Métadonnées enrichies pour SEO
export const metadata = {
  title: "Historique de commandes | Buy It Now",
  description: "Consultez l'historique de vos commandes sur Buy It Now",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: "/me/orders",
  },
};

/**
 * Page d'affichage de l'historique des commandes
 */
const MyOrdersPage = async ({ searchParams }) => {
  const requestId = `orderspage-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .substring(2, 7)}`;

  logger.info("Orders page accessed", {
    requestId,
    page: searchParams?.page || 1,
    action: "orders_page_access",
  });

  try {
    // Vérification de l'authentification côté serveur
    const nextCookies = await cookies();
    const cookieName = getCookieName();
    const sessionCookie = nextCookies.get(cookieName);

    if (!sessionCookie) {
      logger.warn("Unauthenticated access to orders page", {
        requestId,
        action: "unauthenticated_access",
      });
      return redirect("/login?callbackUrl=/me/orders");
    }

    // Récupérer les commandes
    const sanitizedSearchParams = {
      page: searchParams?.page || 1,
    };

    const ordersPromise = await getAllOrders(sanitizedSearchParams);

    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">Mes commandes</h1>
        <Suspense fallback={<OrdersPageSkeleton />}>
          <OrdersData ordersPromise={ordersPromise} />
        </Suspense>
      </div>
    );
  } catch (error) {
    logger.error("Error loading orders page", {
      requestId,
      error: error.message,
      stack: error.stack,
      action: "orders_page_error",
    });

    captureException(error, {
      tags: { component: "MyOrdersPage", action: "page_load" },
      extra: { requestId, searchParams },
    });

    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <h2 className="text-lg font-semibold text-red-700 mb-2">
            Impossible de charger vos commandes
          </h2>
          <p className="text-red-600">
            Nous rencontrons actuellement des difficultés pour récupérer votre
            historique de commandes. Veuillez réessayer ultérieurement ou
            contacter notre service client.
          </p>
        </div>
      </div>
    );
  }
};

// Composant pour gérer le chargement async des données
const OrdersData = async ({ ordersPromise }) => {
  try {
    const orders = await ordersPromise;
    return <ListOrders orders={orders.data} />;
  } catch (error) {
    captureException(error, {
      tags: { component: "OrdersData", action: "data_fetch" },
    });

    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-600">
          Une erreur est survenue lors du chargement de vos commandes. Veuillez
          réessayer.
        </p>
      </div>
    );
  }
};

export default MyOrdersPage;
