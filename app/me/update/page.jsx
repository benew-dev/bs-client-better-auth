import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { captureException } from "@/monitoring/sentry";
import UpdateProfileBasic from "@/components/auth/UpdateProfileBasic";
import UpdateProfileContact from "@/components/auth/UpdateProfileContact";
import { getAuthenticatedUser } from "@/lib/auth-utils";

// Force dynamic rendering pour garantir l'état d'authentification à jour
export const dynamic = "force-dynamic";

// Métadonnées enrichies pour SEO et sécurité
export const metadata = {
  title: "Modifier votre profil | Buy It Now",
  description: "Mettez à jour vos informations personnelles sur Buy It Now",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: "/me/update",
  },
};

/**
 * Server component pour la page de mise à jour de profil
 * Effectue les vérifications d'authentification et de sécurité
 * avant de rendre les composants clients
 */
async function UpdateProfilePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    console.log("User not authenticated, redirecting to login");
    return redirect("/login?callbackUrl=/me/update");
  }

  try {
    const headersList = await headers();
    // Récupérer les en-têtes pour le logging et la sécurité
    const userAgent = headersList.get("user-agent") || "unknown";
    const referer = headersList.get("referer") || "direct";

    // Journal d'accès anonymisé pour la sécurité
    const clientIp = (headersList.get("x-forwarded-for") || "")
      .split(",")
      .shift()
      .trim();
    const anonymizedIp = clientIp ? clientIp.replace(/\d+$/, "xxx") : "unknown";

    console.info("Profile update page accessed", {
      userAgent: userAgent?.substring(0, 100),
      referer: referer?.substring(0, 200),
      ip: anonymizedIp,
      userId: user.id
        ? `${user.id.substring(0, 2)}...${user.id.slice(-2)}`
        : "unknown",
    });

    // Détection basique d'activité potentiellement suspecte
    const isLikelyBot =
      !userAgent ||
      userAgent.toLowerCase().includes("bot") ||
      userAgent.toLowerCase().includes("crawl") ||
      userAgent.toLowerCase().includes("spider");

    if (isLikelyBot) {
      console.warn("Potential bot detected on profile update page", {
        userAgent: userAgent?.substring(0, 100),
        ip: anonymizedIp,
      });
      // On autorise l'accès mais on le note pour monitoring
    }

    // Rendu des composants avec gestion des erreurs
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl">
          {/* Header de la page */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900">
              Modifier votre profil
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Mettez à jour vos informations personnelles
            </p>
          </div>

          {/* Grid avec les deux composants */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Composant 1: Profil de base (Nom + Image) */}
            <div className="bg-white py-8 px-4 sm:px-8 shadow-lg sm:rounded-lg">
              <Suspense
                fallback={
                  <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                    <div className="h-20 bg-gray-200 rounded"></div>
                  </div>
                }
              >
                <UpdateProfileBasic
                  userId={user.id}
                  initialEmail={user.email}
                  referer={referer}
                />
              </Suspense>
            </div>

            {/* Composant 2: Contact (Phone + Adresse) */}
            <div className="bg-white py-8 px-4 sm:px-8 shadow-lg sm:rounded-lg">
              <Suspense
                fallback={
                  <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                    <div className="space-y-3">
                      <div className="h-10 bg-gray-200 rounded"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                }
              >
                <UpdateProfileContact userId={user.id} referer={referer} />
              </Suspense>
            </div>
          </div>

          {/* Note informative */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-blue-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Information
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Vous pouvez mettre à jour votre profil et vos informations
                    de contact séparément. Chaque section se sauvegarde
                    indépendamment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    // Journalisation détaillée de l'erreur
    console.error("Error initializing profile update page", {
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });

    // Capture d'exception pour Sentry avec contexte enrichi
    captureException(error, {
      tags: {
        component: "UpdateProfilePage",
        errorType: error.name,
      },
      extra: {
        message: error.message,
      },
    });

    // Lancer une erreur propre pour le boundary d'erreur
    throw new Error("Impossible de charger la page de modification du profil", {
      cause: error,
    });
  }
}

export default UpdateProfilePage;
