import { Suspense, lazy } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { captureException } from "@/monitoring/sentry";
import CartSkeleton from "@/components/skeletons/CartSkeleton";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// Forcer le rendu dynamique pour cette page
export const dynamic = "force-dynamic";

// Lazy loading du composant Cart
const Cart = lazy(() => import("@/components/cart/Cart"));

// Métadonnées enrichies pour le panier
export const metadata = {
  title: "Votre Panier | Buy It Now",
  description:
    "Consultez et gérez les articles de votre panier sur Buy It Now.",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Votre Panier | Buy It Now",
    description:
      "Consultez et gérez les articles de votre panier sur Buy It Now.",
    type: "website",
  },
  alternates: {
    canonical: "/cart",
  },
};

const CartPage = async () => {
  // Vérifier si l'utilisateur est déjà connecté
  const headersList = await headers();
  const user = await getAuthenticatedUser(headersList);

  if (!user) {
    // Rediriger l'utilisateur déjà connecté vers la page d'accueil
    return redirect("/login");
  }

  return (
    <div itemScope itemType="https://schema.org/ItemList">
      <meta itemProp="name" content="Shopping Cart" />
      <Suspense fallback={<CartSkeleton />}>
        <Cart />
      </Suspense>
    </div>
  );
};

export default CartPage;
