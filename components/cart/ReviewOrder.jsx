"use client";

import { useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "react-toastify";
import { captureException } from "@/monitoring/sentry";
import dynamic from "next/dynamic";

// Contextes
import CartContext from "@/context/CartContext";
import OrderContext from "@/context/OrderContext";

// Icônes
import {
  CreditCard,
  ChevronLeft,
  CheckCircle,
  LoaderCircle,
  Package,
  Info,
  Banknote,
} from "lucide-react";

// Helpers
import { formatPrice } from "@/helpers/helpers";

// Chargement dynamique des composants
const BreadCrumbs = dynamic(() => import("@/components/layouts/BreadCrumbs"), {
  loading: () => <div className="h-12 animate-pulse bg-gray-200 rounded"></div>,
  ssr: true,
});

const ReviewOrder = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Contextes
  const { cart, cartTotal, cartCount } = useContext(CartContext);
  const { orderInfo, addOrder, error, clearErrors } = useContext(OrderContext);

  // Vérifier si c'est un paiement CASH
  const isCashPayment = useMemo(() => {
    return (
      orderInfo?.paymentInfo?.typePayment === "CASH" ||
      orderInfo?.paymentInfo?.isCashPayment === true
    );
  }, [orderInfo]);

  // Vérification que les données de paiement sont présentes
  useEffect(() => {
    const checkOrderData = async () => {
      try {
        setIsLoading(true);

        // Vérifier que l'utilisateur a bien rempli le formulaire de paiement
        if (!orderInfo || !orderInfo.paymentInfo) {
          toast.error(
            "Veuillez d'abord renseigner vos informations de paiement",
          );
          router.push("/payment");
          return;
        }

        // Vérifier que le panier n'est pas vide
        if (!cart || cart.length === 0) {
          toast.error("Votre panier est vide");
          router.push("/cart");
          return;
        }

        // Précharger la page de confirmation
        router.prefetch("/confirmation");
      } catch (error) {
        console.error("Erreur lors de la vérification des données:", error);
        captureException(error, {
          tags: { component: "ReviewOrder", action: "checkOrderData" },
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkOrderData();
  }, [orderInfo, cart, router]);

  // Gestion des erreurs
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearErrors();
    }
  }, [error, clearErrors]);

  // Calculer le total
  const totalAmount = useMemo(() => {
    return cartTotal?.toFixed(2) || "0.00";
  }, [cartTotal]);

  // Fil d'Ariane
  const breadCrumbs = useMemo(
    () => [
      { name: "Accueil", url: "/" },
      { name: "Panier", url: "/cart" },
      { name: "Paiement", url: "/payment" },
      { name: "Révision", url: "" },
    ],
    [],
  );

  // Handler pour la confirmation de la commande
  const handleConfirmOrder = useCallback(async () => {
    try {
      setIsSubmitting(true);

      // Vérifications finales
      if (!orderInfo || !orderInfo.paymentInfo) {
        toast.error("Informations de commande incomplètes");
        router.push("/payment");
        return;
      }

      // Envoyer la commande
      await addOrder(orderInfo);

      // La redirection vers /confirmation est gérée par le contexte OrderContext
    } catch (error) {
      console.error("Erreur lors de la confirmation de la commande:", error);
      captureException(error, {
        tags: { component: "ReviewOrder", action: "handleConfirmOrder" },
      });
      toast.error("Une erreur est survenue lors de la confirmation");
    } finally {
      setIsSubmitting(false);
    }
  }, [orderInfo, addOrder, router]);

  // Affichage du loader
  if (isLoading) {
    return <ReviewOrderSkeleton />;
  }

  // Vérification des données
  if (!orderInfo || !orderInfo.paymentInfo) {
    return null;
  }

  // Extraire les informations de paiement avec le nouveau modèle
  const { typePayment, paymentAccountName, paymentAccountNumber } =
    orderInfo.paymentInfo;

  return (
    <div className="min-h-screen bg-gray-50">
      <BreadCrumbs breadCrumbs={breadCrumbs} />

      {/* En-tête de la page */}
      <section className="py-5 sm:py-7 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">
              Révision de votre commande
            </h1>
            <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
              Étape finale
            </span>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-10">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Colonne principale - Détails de la commande */}
            <div className="md:col-span-2 space-y-6">
              {/* Section Articles */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                    <Package className="mr-2 text-blue-600" size={20} />
                    Articles ({cartCount})
                  </h2>
                  <Link
                    href="/cart"
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Modifier
                  </Link>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {cart?.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start space-x-4 pb-4 border-b last:border-b-0"
                    >
                      <div className="relative w-20 h-20 flex-shrink-0">
                        <Image
                          src={item.imageUrl || "/images/default_product.png"}
                          alt={item.productName}
                          fill
                          className="object-cover rounded-lg"
                          sizes="80px"
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-800">
                          {item.productName}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Quantité: {item.quantity}
                        </p>
                        <p className="text-sm font-medium text-gray-700 mt-1">
                          {formatPrice(item.price)} × {item.quantity}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-800">
                          {formatPrice(item.subtotal)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section Informations de paiement */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                    {isCashPayment ? (
                      <Banknote className="mr-2 text-green-600" size={20} />
                    ) : (
                      <CreditCard className="mr-2 text-blue-600" size={20} />
                    )}
                    Informations de paiement
                  </h2>
                  <Link
                    href="/payment"
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Modifier
                  </Link>
                </div>

                {isCashPayment ? (
                  // Affichage spécifique pour paiement CASH
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <Banknote
                        className="mr-3 text-green-600 flex-shrink-0 mt-0.5"
                        size={24}
                      />
                      <div>
                        <h3 className="font-semibold text-green-800 mb-2">
                          Paiement en espèces
                        </h3>
                        <p className="text-sm text-green-700 mb-2">
                          Vous paierez en espèces lors de la récupération de
                          votre commande.
                        </p>
                        <div className="mt-3 pt-3 border-t border-green-300">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-green-700">
                              Montant à préparer:
                            </span>
                            <span className="font-bold text-green-800">
                              {formatPrice(totalAmount)}
                            </span>
                          </div>
                          <p className="text-xs text-green-600 mt-2">
                            💡 Conseil: Préparez la somme exacte pour faciliter
                            la transaction
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Affichage pour paiement électronique
                  <div className="space-y-3">
                    <div className="flex justify-between py-2">
                      <span className="text-gray-600">Plateforme:</span>
                      <span className="font-medium text-gray-800 px-3 py-1 bg-blue-100 rounded-full text-sm">
                        {typePayment}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-gray-600">Nom du compte:</span>
                      <span className="font-medium text-gray-800">
                        {paymentAccountName}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-gray-600">Numéro de compte:</span>
                      <span className="font-medium text-gray-800">
                        {paymentAccountNumber}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Message d'information adapté */}
              <div
                className={`border rounded-lg p-4 ${
                  isCashPayment
                    ? "bg-green-50 border-green-200"
                    : "bg-blue-50 border-blue-200"
                }`}
              >
                <p
                  className={`flex items-start text-sm ${
                    isCashPayment ? "text-green-700" : "text-blue-700"
                  }`}
                >
                  <Info className="mr-2 flex-shrink-0 mt-0.5" size={16} />
                  {isCashPayment ? (
                    <>
                      En confirmant votre commande, vous vous engagez à payer en
                      espèces lors de la récupération. Votre commande sera
                      préparée et vous serez contacté une fois prête.
                    </>
                  ) : (
                    <>
                      En cliquant sur &quot;Confirmer et payer&quot;, vous
                      acceptez nos conditions générales de vente et confirmez
                      que toutes les informations fournies sont correctes.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Colonne latérale - Résumé et actions */}
            <div className="md:col-span-1">
              <div className="bg-white shadow rounded-lg p-6 sticky top-24">
                <h2 className="font-semibold text-lg mb-4">
                  Résumé de commande
                </h2>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-gray-600">
                    <span>Sous-total ({cartCount} articles):</span>
                    <span>{formatPrice(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Frais de livraison:</span>
                    <span className="text-green-600">Gratuit</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between text-lg font-bold">
                      <span>
                        {isCashPayment ? "Total à préparer:" : "Total à payer:"}
                      </span>
                      <span
                        className={
                          isCashPayment ? "text-green-600" : "text-blue-600"
                        }
                      >
                        {formatPrice(totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Boutons d'action */}
                <div className="space-y-3">
                  <button
                    onClick={handleConfirmOrder}
                    disabled={isSubmitting}
                    className={`w-full px-5 py-3 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      isSubmitting
                        ? "bg-gray-400 cursor-not-allowed"
                        : isCashPayment
                          ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                          : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                    }`}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center">
                        <LoaderCircle className="animate-spin -ml-1 mr-2 h-5 w-5" />
                        Traitement en cours...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center">
                        <CheckCircle className="mr-2" size={20} />
                        {isCashPayment
                          ? "Confirmer la commande"
                          : "Confirmer et payer"}
                      </span>
                    )}
                  </button>

                  <Link
                    href="/payment"
                    className="w-full px-5 py-3 text-gray-700 font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 flex items-center justify-center"
                  >
                    <ChevronLeft className="mr-2" size={20} />
                    Retour au paiement
                  </Link>
                </div>

                {/* Badges de sécurité */}
                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center justify-center space-x-2 text-gray-500">
                    <CheckCircle size={16} />
                    <span className="text-xs">
                      {isCashPayment
                        ? "Commande sécurisée"
                        : "Paiement sécurisé"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// Skeleton de chargement
export const ReviewOrderSkeleton = () => (
  <div className="min-h-screen bg-gray-50 py-12">
    <div className="container max-w-6xl mx-auto px-4">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-8"></div>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-lg p-6">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex space-x-4">
                    <div className="w-20 h-20 bg-gray-200 rounded"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg p-6">
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-10 bg-gray-200 rounded mt-4"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default ReviewOrder;
