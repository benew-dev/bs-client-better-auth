import { Suspense, lazy } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { captureException } from "@/monitoring/sentry";
import ReviewOrderSkeleton from "@/components/skeletons/ReviewOrderSkeleton";

// Forcer le rendu dynamique pour cette page
export const dynamic = "force-dynamic";

// Lazy loading du composant ReviewOrder
const ReviewOrder = lazy(() => import("@/components/cart/ReviewOrder"));

// Métadonnées enrichies pour le SEO
export const metadata = {
  title: "Révision de votre commande | Buy It Now",
  description:
    "Vérifiez les détails de votre commande avant de procéder au paiement final",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
  openGraph: {
    title: "Révision de votre commande | Buy It Now",
    description:
      "Vérifiez les détails de votre commande avant de procéder au paiement final",
    type: "website",
  },
  alternates: {
    canonical: "/review-order",
  },
};

const ReviewOrderPage = async () => {
  try {
    // Vérification de l'authentification côté serveur
    const cookieStore = await cookies();
    const sessionCookie =
      cookieStore.get("__Secure-.session_token") ||
      cookieStore.get("__Secure-__Secure-.session_token");

    if (!sessionCookie) {
      // Rediriger vers la page de connexion avec retour après authentification
      return redirect("/login?callbackUrl=/review-order");
    }

    return (
      <div
        className="review-order-page"
        itemScope
        itemType="https://schema.org/WebPage"
      >
        <meta itemProp="name" content="Révision de commande" />
        <Suspense fallback={<ReviewOrderSkeleton />}>
          <ReviewOrder />
        </Suspense>
      </div>
    );
  } catch (error) {
    // Capture et journalisation de l'erreur
    console.error("Error in review order page:", error);
    captureException(error, {
      tags: { component: "ReviewOrderPage" },
    });

    // Redirection de secours en cas d'erreur critique
    return redirect("/payment");
  }
};

export default ReviewOrderPage;
