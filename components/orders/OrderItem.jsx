"use client";

import { memo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronUp, Banknote, CreditCard } from "lucide-react";

// Chargement dynamique des composants
const OrderedProduct = dynamic(() => import("./OrderedProduct"), {
  loading: () => (
    <div className="h-28 bg-gray-100 rounded-md animate-pulse"></div>
  ),
  ssr: true,
});

/**
 * Composant d'affichage d'une commande individuelle
 * Adapté au modèle Order avec support du paiement CASH
 */
const OrderItem = memo(({ order }) => {
  const [expanded, setExpanded] = useState(false);

  // Validation des données
  if (!order || typeof order !== "object" || !order._id) {
    return null;
  }

  // Vérifier si c'est un paiement en espèces
  const isCashPayment =
    order.paymentInfo?.typePayment === "CASH" ||
    order.paymentInfo?.isCashPayment === true ||
    order.isCashPayment === true;

  // Formatage des dates avec gestion d'erreur
  const formatDate = useCallback((dateString, format = "full") => {
    if (!dateString) return "Date non disponible";
    try {
      const date = new Date(dateString);

      if (format === "short") {
        return date.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      }

      return date.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      console.error("Date formatting error:", err);
      return dateString.substring(0, 10);
    }
  }, []);

  // Gestion du basculement de l'expansion des détails
  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Extraction et validation des données de la commande
  const orderNumber = order.orderNumber || `ORD-${order._id.substring(0, 8)}`;
  const updatedDate = order.updatedAt ? formatDate(order.updatedAt) : null;
  const paymentStatus = order.paymentStatus || "unpaid";
  const isCancelled = !!order.cancelledAt;

  // Utilisation du totalAmount du modèle
  const totalAmount = order.totalAmount || 0;

  // Calcul du nombre total d'articles
  const totalItems =
    order.orderItems?.reduce(
      (total, item) => total + (item.quantity || 0),
      0,
    ) || 0;

  // Configuration des couleurs selon le statut de paiement avec support CASH
  const getPaymentStatusStyle = (status, isCash) => {
    if (isCash) {
      return "text-green-600 bg-green-100 border-green-300";
    }

    switch (status) {
      case "paid":
        return "text-green-600 bg-green-100 border-green-300";
      case "unpaid":
        return "text-red-600 bg-red-100 border-red-300";
      case "processing":
        return "text-yellow-600 bg-yellow-100 border-yellow-300";
      case "pending_cash":
        return "text-amber-600 bg-amber-100 border-amber-300";
      case "refunded":
        return "text-orange-600 bg-orange-100 border-orange-300";
      case "failed":
        return "text-gray-600 bg-gray-100 border-gray-300";
      default:
        return "text-gray-600 bg-gray-100 border-gray-300";
    }
  };

  // Obtenir le libellé du statut de paiement
  const getPaymentStatusLabel = (status, isCash) => {
    if (isCash) {
      return status === "pending_cash"
        ? "EN ATTENTE (ESPÈCES)"
        : "PAIEMENT ESPÈCES";
    }

    switch (status) {
      case "paid":
        return "PAYÉ";
      case "unpaid":
        return "NON PAYÉ";
      case "processing":
        return "EN TRAITEMENT";
      case "pending_cash":
        return "EN ATTENTE (ESPÈCES)";
      case "refunded":
        return "REMBOURSÉ";
      case "failed":
        return "ÉCHOUÉ";
      default:
        return status.toUpperCase();
    }
  };

  return (
    <article className="p-3 lg:p-5 mb-5 bg-white border border-gray-200 rounded-md shadow-sm hover:shadow-md transition-shadow">
      <header className="lg:flex justify-between mb-4">
        <div className="mb-4 lg:mb-0">
          <div className="flex items-center">
            <h3 className="font-semibold text-lg">
              Commande:{" "}
              <span className="font-mono text-gray-700">{orderNumber}</span>
            </h3>
            <button
              onClick={toggleExpanded}
              className="ml-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label={
                expanded ? "Réduire les détails" : "Voir plus de détails"
              }
            >
              {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`px-2 py-1 rounded-full text-xs font-semibold border ${getPaymentStatusStyle(paymentStatus, isCashPayment)}`}
            >
              {isCashPayment && <Banknote size={12} className="inline mr-1" />}
              {getPaymentStatusLabel(paymentStatus, isCashPayment)}
            </span>

            {isCancelled && (
              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-300">
                ANNULÉE
              </span>
            )}

            <span className="text-gray-500 text-sm ml-2">
              {formatDate(order.createdAt, "short")}
            </span>

            <span className="text-gray-500 text-sm">
              • {totalItems} article{totalItems > 1 ? "s" : ""}
            </span>
          </div>

          {/* Message spécifique pour les paiements en espèces */}
          {isCashPayment && (
            <div className="mt-2 flex items-center text-sm text-green-700">
              <Banknote size={16} className="mr-1" />
              <span className="font-medium">
                {order.paymentStatusDescription ||
                  "Paiement en espèces à la récupération"}
              </span>
            </div>
          )}
        </div>

        {/* Montant total en header avec style adapté au paiement CASH */}
        <div className="text-right">
          <p className="text-sm text-gray-600">
            {isCashPayment ? "Montant à préparer" : "Montant total"}
          </p>
          <p
            className={`text-2xl font-bold ${isCashPayment ? "text-green-600" : "text-blue-600"}`}
          >
            ${totalAmount.toFixed(2)}
          </p>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <p className="text-gray-600 mb-1 font-medium text-sm">Client</p>
          <ul className="text-gray-700 text-sm space-y-1">
            <li className="font-medium">{order.user?.name || "Client"}</li>
            {order.user?.phone && (
              <li className="text-gray-600">{order.user.phone}</li>
            )}
            <li className="text-gray-600 text-xs truncate">
              {order.user?.email || "Email non disponible"}
            </li>
          </ul>
        </div>

        <div>
          <p className="text-gray-600 mb-1 font-medium text-sm">
            Résumé financier
          </p>
          <ul className="text-gray-700 text-sm space-y-1">
            <li className="pt-1">
              <span className="font-semibold">Total:</span>{" "}
              <span
                className={`font-bold ${isCashPayment ? "text-green-600" : "text-blue-600"}`}
              >
                ${totalAmount.toFixed(2)}
              </span>
            </li>
            <li className="text-xs text-gray-500">
              ({totalItems} article{totalItems > 1 ? "s" : ""})
            </li>
            {isCashPayment && (
              <li className="text-xs text-green-600 font-medium">
                💡 Préparez la somme exacte
              </li>
            )}
          </ul>
        </div>

        <div>
          <p className="text-gray-600 mb-1 font-medium text-sm flex items-center gap-1">
            {isCashPayment ? <Banknote size={16} /> : <CreditCard size={16} />}
            Information de paiement
          </p>
          {isCashPayment ? (
            <div className="text-sm bg-green-50 p-2 rounded border border-green-200">
              <p className="font-semibold text-green-800 mb-1">
                Paiement en espèces
              </p>
              <p className="text-green-700 text-xs">
                {order.paymentInfo?.cashPaymentNote ||
                  "Le paiement sera effectué en espèces lors de la récupération"}
              </p>
            </div>
          ) : (
            <ul className="text-gray-700 text-sm space-y-1">
              <li>
                <span className="text-gray-600">Mode:</span>{" "}
                <span className="font-medium">
                  {order.paymentInfo?.typePayment || "-"}
                </span>
              </li>
              <li>
                <span className="text-gray-600">Nom:</span>{" "}
                <span className="font-medium">
                  {order.paymentInfo?.paymentAccountName || "-"}
                </span>
              </li>
              <li>
                <span className="text-gray-600">Numéro:</span>{" "}
                <span className="font-mono text-xs">
                  {order.paymentInfo?.paymentAccountNumber || "••••••••"}
                </span>
              </li>
              {order.paymentInfo?.paymentDate && (
                <li>
                  <span className="text-gray-600">Date paiement:</span>{" "}
                  <span className="text-xs">
                    {formatDate(order.paymentInfo.paymentDate, "short")}
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {expanded && (
        <>
          <hr className="my-4" />

          {/* Timeline des dates importantes */}
          {(order.paidAt || order.cancelledAt || order.updatedAt) && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-2 font-medium text-sm">
                Historique de la commande
              </p>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Créée le:</span>
                  <p className="text-gray-700">{formatDate(order.createdAt)}</p>
                </div>

                {order.paidAt && (
                  <div>
                    <span className="font-medium text-green-600">
                      Payée le:
                    </span>
                    <p className="text-gray-700">{formatDate(order.paidAt)}</p>
                  </div>
                )}

                {order.cancelledAt && (
                  <div>
                    <span className="font-medium text-red-600">
                      Annulée le:
                    </span>
                    <p className="text-gray-700">
                      {formatDate(order.cancelledAt)}
                    </p>
                  </div>
                )}

                {updatedDate && order.updatedAt !== order.createdAt && (
                  <div>
                    <span className="font-medium text-gray-600">
                      Dernière mise à jour:
                    </span>
                    <p className="text-gray-700">{updatedDate}</p>
                  </div>
                )}
              </div>

              {order.cancelReason && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
                  <p className="font-medium text-red-600 text-sm">
                    Raison d&apos;annulation:
                  </p>
                  <p className="text-red-700 text-sm mt-1">
                    {order.cancelReason}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Instructions spéciales pour les paiements CASH */}
          {isCashPayment && paymentStatus === "pending_cash" && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start">
                <Banknote
                  className="mr-3 text-green-600 flex-shrink-0 mt-0.5"
                  size={24}
                />
                <div>
                  <h4 className="font-semibold text-green-800 mb-2">
                    Instructions pour le paiement
                  </h4>
                  <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
                    <li>
                      Préparez le montant exact: ${totalAmount.toFixed(2)}
                    </li>
                    <li>Vous serez contacté une fois la commande prête</li>
                    <li>Le paiement se fera lors de la récupération</li>
                    <li>Aucun acompte n&apos;est requis</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="text-gray-600 mb-3 font-medium">Articles commandés</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {order.orderItems &&
              Array.isArray(order.orderItems) &&
              order.orderItems.length > 0 ? (
                order.orderItems.map((item) => (
                  <OrderedProduct
                    key={
                      item._id ||
                      `item-${Math.random().toString(36).substring(2)}`
                    }
                    item={item}
                  />
                ))
              ) : (
                <p className="text-gray-500 italic col-span-full">
                  Aucun article dans cette commande
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <div className="text-center mt-4">
        <button
          onClick={toggleExpanded}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
        >
          {expanded ? "Masquer les détails" : "Afficher les détails"}
        </button>
      </div>
    </article>
  );
});

// Ajouter un displayName pour faciliter le débogage
OrderItem.displayName = "OrderItem";

export default OrderItem;
