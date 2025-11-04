import { Suspense, lazy } from "react";
import { cookies } from "next/headers";
import { captureException } from "@/monitoring/sentry";
import PaymentPageSkeleton from "@/components/skeletons/PaymentPageSkeleton";
import { redirect } from "next/navigation";

// Forcer le rendu dynamique pour cette page
export const dynamic = "force-dynamic";

// Lazy loading du composant Payment
const Payment = lazy(() => import("@/components/cart/Payment"));

// Métadonnées enrichies pour le SEO
export const metadata = {
  title: "Paiement de votre commande | Buy It Now",
  description:
    "Finalisez votre commande en choisissant votre méthode de paiement préférée",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Paiement de votre commande | Buy It Now",
    description:
      "Finalisez votre commande en choisissant votre méthode de paiement préférée",
    type: "website",
  },
  alternates: {
    canonical: "/payment",
  },
};

/**
 * Récupère toutes les plateformes de paiement depuis l'API
 * Version optimisée avec cache long (les plateformes changent rarement)
 *
 * @returns {Promise<Object>} Données des plateformes ou erreur
 */
const getPaymentPlatforms = async () => {
  try {
    const apiUrl = `${
      process.env.API_URL || "https://bs-client-blond.vercel.app"
    }/api/paymentPlatform`;

    console.log("Fetching payment platforms from:", apiUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        revalidate: 1800, // Cache Next.js de 30 minutes (plateformes stables)
        tags: ["payment-platforms"],
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error(`API Error: ${res.status} - ${res.statusText}`);

      if (res.status === 404) {
        return {
          success: true,
          message: "Aucune plateforme de paiement disponible",
          platforms: [],
          count: 0,
        };
      }

      return {
        success: false,
        message: "Erreur lors de la récupération des plateformes de paiement",
        platforms: [],
        count: 0,
      };
    }

    const responseBody = await res.json();

    if (!responseBody.success || !responseBody.data) {
      console.error("Invalid API response structure:", responseBody);
      return {
        success: false,
        message: responseBody.message || "Réponse API invalide",
        platforms: [],
        count: 0,
      };
    }

    const platforms = responseBody.data.platforms || [];

    return {
      success: true,
      message: "Plateformes de paiement récupérées avec succès",
      platforms: platforms,
      count: responseBody.data.count || platforms.length,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("Request timeout after 5 seconds");
      return {
        success: false,
        message: "La requête a pris trop de temps",
        platforms: [],
        count: 0,
      };
    }

    console.error("Network error:", error.message);
    return {
      success: false,
      message: "Problème de connexion réseau",
      platforms: [],
      count: 0,
    };
  }
};

/**
 * Page de paiement - Server Component
 * Vérifie l'authentification et charge les plateformes de paiement
 */
const PaymentPage = async () => {
  try {
    // Vérification de l'authentification côté serveur
    const cookieStore = await cookies();
    const sessionCookie =
      cookieStore.get("__Secure-.session_token") ||
      cookieStore.get("__Secure-__Secure-.session_token");

    if (!sessionCookie) {
      // Rediriger vers la page de connexion avec retour après authentification
      return redirect("/login?callbackUrl=/payment");
    }

    // Récupérer les plateformes de paiement
    const platformsData = await getPaymentPlatforms();

    // Log en cas d'erreur de récupération (mais ne bloque pas la page)
    if (!platformsData.success) {
      console.warn("Failed to fetch payment platforms:", platformsData.message);
    }

    return (
      <div
        className="payment-page"
        itemScope
        itemType="https://schema.org/WebPage"
      >
        <meta itemProp="name" content="Paiement" />
        <Suspense fallback={<PaymentPageSkeleton />}>
          <Payment paymentTypes={platformsData.platforms} />
        </Suspense>
      </div>
    );
  } catch (error) {
    // Capture et journalisation de l'erreur
    console.error("Error in payment page:", error);
    captureException(error, {
      tags: { component: "PaymentPage" },
    });

    // Redirection de secours en cas d'erreur critique
    return redirect("/cart");
  }
};

export default PaymentPage;
