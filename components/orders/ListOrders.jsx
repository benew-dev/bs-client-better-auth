"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ShoppingBag, Banknote } from "lucide-react";
import captureClientError from "@/monitoring/sentry";

// Chargement dynamique des composants
const OrderItem = dynamic(() => import("./OrderItem"), {
  loading: () => <OrderItemSkeleton />,
  ssr: true,
});

const CustomPagination = dynamic(
  () => import("@/components/layouts/CustomPagination"),
  { ssr: true },
);

// Composant squelette pour le chargement
const OrderItemSkeleton = () => (
  <div
    className="p-3 lg:p-5 mb-5 bg-white border border-gray-200 rounded-md animate-pulse"
    aria-hidden="true"
  >
    <div className="flex justify-between mb-4">
      <div className="w-1/3">
        <div className="h-5 bg-gray-200 rounded mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-24"></div>
      </div>
    </div>
    <div className="grid md:grid-cols-3 gap-1">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="mb-3">
          <div className="h-4 bg-gray-200 rounded mb-2 w-24"></div>
          <div className="h-3 bg-gray-200 rounded mb-1 w-full"></div>
          <div className="h-3 bg-gray-200 rounded mb-1 w-3/4"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  </div>
);

/**
 * Composant d'affichage de la liste des commandes
 * Adapté au modèle Order avec support du paiement CASH
 */
const ListOrders = ({ orders }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortOrder, setSortOrder] = useState("desc");

  const router = useRouter();
  const searchParams = useSearchParams();

  // Obtenir la page courante depuis l'URL
  const currentPage = useMemo(() => {
    const page = searchParams?.get("page");
    return page ? parseInt(page, 10) : 1;
  }, [searchParams]);

  // Vérification et utilisation sûre des données
  const hasOrders = useMemo(() => {
    return (
      orders?.orders && Array.isArray(orders.orders) && orders.orders.length > 0
    );
  }, [orders]);

  const totalPages = useMemo(() => {
    return orders?.totalPages && !isNaN(parseInt(orders.totalPages))
      ? parseInt(orders.totalPages)
      : 1;
  }, [orders]);

  // Calculer le nombre de commandes CASH
  const cashOrdersCount = useMemo(() => {
    if (!hasOrders) return 0;
    return orders.orders.filter((order) => order.isCashPayment).length;
  }, [hasOrders, orders]);

  // Filtrage et tri des commandes - ADAPTÉ AU NOUVEAU MODÈLE AVEC CASH
  const filteredAndSortedOrders = useMemo(() => {
    try {
      if (!hasOrders) return [];

      let filtered = [...orders.orders];

      // Filtrage par statut de paiement avec support CASH
      if (filterStatus !== "all") {
        filtered = filtered.filter((order) => {
          if (filterStatus === "paid") return order.paymentStatus === "paid";
          if (filterStatus === "unpaid")
            return order.paymentStatus === "unpaid";
          if (filterStatus === "processing")
            return order.paymentStatus === "processing";
          if (filterStatus === "refunded")
            return order.paymentStatus === "refunded";
          if (filterStatus === "failed")
            return order.paymentStatus === "failed";
          if (filterStatus === "pending_cash")
            return (
              order.paymentStatus === "pending_cash" || order.isCashPayment
            );
          if (filterStatus === "cash") return order.isCashPayment === true;
          if (filterStatus === "cancelled") return !!order.cancelledAt;
          return true;
        });
      }

      // Tri par date
      filtered.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      });

      return filtered;
    } catch (error) {
      captureClientError(error, "ListOrders", "filterAndSort", true, {
        filterStatus,
        sortOrder,
        ordersCount: orders?.orders?.length || 0,
        hasValidOrders: hasOrders,
      });

      return [];
    }
  }, [hasOrders, orders?.orders, filterStatus, sortOrder]);

  const handlePageChange = useCallback(
    (pageNumber) => {
      try {
        if (!pageNumber || pageNumber < 1 || pageNumber > totalPages) {
          const validationError = new Error(`Page invalide: ${pageNumber}`);
          captureClientError(
            validationError,
            "ListOrders",
            "pageValidation",
            false,
            {
              requestedPage: pageNumber,
              totalPages,
              currentPage,
            },
          );
          setError("Numéro de page invalide");
          return;
        }

        setIsLoading(true);
        router.push(`/me/orders?page=${pageNumber}`);
      } catch (err) {
        captureClientError(err, "ListOrders", "navigationError", true, {
          requestedPage: pageNumber,
          currentPage,
          totalPages,
          errorMessage: err.message,
        });

        setError("Erreur lors du changement de page");
        console.error("Error changing page:", err);
      }
    },
    [router, currentPage, totalPages],
  );

  // Réinitialiser les états lors du changement de données
  useEffect(() => {
    if (isLoading) setIsLoading(false);
    if (error) setError(null);
  }, [orders]);

  // Gérer les erreurs
  if (error) {
    return (
      <div
        className="p-4 bg-red-50 border border-red-200 rounded-md"
        role="alert"
      >
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="orders-container">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <h2 className="text-xl font-semibold mb-4 sm:mb-0">
          Historique de vos commandes
        </h2>

        {/* Filtres et tri - ADAPTÉ AU NOUVEAU MODÈLE AVEC CASH */}
        {hasOrders && (
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filtrer par statut"
            >
              <option value="all">Tous les statuts</option>
              <option value="paid">✓ Payées</option>
              <option value="unpaid">✗ Non payées</option>
              <option value="pending_cash">💵 En attente (Espèces)</option>
              <option value="cash">💰 Paiement en espèces</option>
              <option value="processing">⏳ En traitement</option>
              <option value="refunded">↩ Remboursées</option>
              <option value="failed">⚠ Échouées</option>
              <option value="cancelled">🚫 Annulées</option>
            </select>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Trier par date"
            >
              <option value="desc">Plus récentes</option>
              <option value="asc">Plus anciennes</option>
            </select>
          </div>
        )}
      </div>

      {/* Statistiques avec support CASH */}
      {hasOrders && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
            <p className="text-sm text-gray-600">Total commandes</p>
            <p className="text-xl font-bold text-gray-900">{orders.count}</p>
          </div>
          <div className="bg-green-50 p-3 rounded-md border border-green-200">
            <p className="text-sm text-green-600">Payées</p>
            <p className="text-xl font-bold text-green-900">
              {orders.paidCount}
            </p>
          </div>
          <div className="bg-red-50 p-3 rounded-md border border-red-200">
            <p className="text-sm text-red-600">Non payées</p>
            <p className="text-xl font-bold text-red-900">
              {orders.unpaidCount}
            </p>
          </div>
          <div className="bg-amber-50 p-3 rounded-md border border-amber-200">
            <p className="text-sm text-amber-600 flex items-center gap-1">
              <Banknote size={14} />
              En espèces
            </p>
            <p className="text-xl font-bold text-amber-900">
              {orders.pendingCashCount || cashOrdersCount}
            </p>
          </div>
          <div className="bg-purple-50 p-3 rounded-md border border-purple-200">
            <p className="text-sm text-purple-600">Montant total</p>
            <p className="text-xl font-bold text-purple-900">
              ${orders.totalAmountOrders?.totalAmount?.toFixed(2) || "0.00"}
            </p>
          </div>
        </div>
      )}

      {/* Message informatif pour les paiements en espèces */}
      {hasOrders && cashOrdersCount > 0 && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start">
            <Banknote
              className="mr-3 text-green-600 flex-shrink-0 mt-0.5"
              size={20}
            />
            <div>
              <h3 className="font-semibold text-green-800 mb-1">
                Commandes avec paiement en espèces
              </h3>
              <p className="text-sm text-green-700">
                Vous avez {cashOrdersCount} commande
                {cashOrdersCount > 1 ? "s" : ""} avec paiement en espèces. Le
                paiement sera effectué lors de la récupération.
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div aria-live="polite" aria-busy="true">
          {[...Array(3)].map((_, i) => (
            <OrderItemSkeleton key={i} />
          ))}
        </div>
      ) : !hasOrders ? (
        <div className="flex flex-col items-center p-8 bg-gray-50 rounded-lg border border-gray-200">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-blue-100 mb-4">
            <ShoppingBag
              size={32}
              strokeWidth={1.5}
              className="text-blue-600"
            />
          </div>
          <h3 className="font-semibold text-lg mb-2">Aucune commande</h3>
          <p className="text-gray-600 text-center mb-4">
            Vous n&apos;avez pas encore effectué de commande.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Découvrir nos produits
          </button>
        </div>
      ) : (
        <>
          {filteredAndSortedOrders.length === 0 ? (
            <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-md text-center">
              <p className="text-yellow-800">
                Aucune commande ne correspond à vos filtres.
              </p>
              <button
                onClick={() => setFilterStatus("all")}
                className="mt-3 text-blue-600 hover:text-blue-800 underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-4" aria-label="Liste de vos commandes">
                {filteredAndSortedOrders.map((order) => (
                  <OrderItem key={order._id} order={order} />
                ))}
              </div>

              {totalPages > 1 && filterStatus === "all" && (
                <div className="mt-8">
                  <CustomPagination
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ListOrders;
