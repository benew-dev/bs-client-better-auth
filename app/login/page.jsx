import { headers } from "next/headers";
import Login from "@/components/auth/Login";
import { verifySession } from "@/lib/auth-utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Métadonnées enrichies pour SEO et sécurité
export const metadata = {
  title: "Connexion | Buy It Now",
  description:
    "Connectez-vous à votre compte Buy It Now pour accéder à vos commandes et informations personnelles.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "Connexion | Buy It Now",
    description: "Connectez-vous à votre compte Buy It Now",
    type: "website",
    images: [
      {
        url: "/images/auth-banner.jpg",
        width: 1200,
        height: 630,
        alt: "Buy It Now - Connexion",
      },
    ],
  },
};

async function LoginPage() {
  // Vérifier si l'utilisateur est déjà connecté
  const { success, session } = await verifySession();

  if (session && success) {
    console.log("An user is already logged in");
    return redirect("/");
  }

  try {
    const headersList = await headers();
    const userAgent = headersList.get("user-agent") || "unknown";
    const referer = headersList.get("referer") || "direct";
    const callbackUrl = "/";

    // Journaliser l'accès à la page (anonymisé)
    const clientIp = (headersList.get("x-forwarded-for") || "")
      .split(",")
      .shift()
      .trim();
    const anonymizedIp = clientIp ? clientIp.replace(/\d+$/, "xxx") : "unknown";

    console.info("Login page accessed", {
      userAgent: userAgent?.substring(0, 100),
      referer: referer?.substring(0, 200),
      ip: anonymizedIp,
    });

    return (
      <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Connexion à votre compte
          </h1>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <Login callbackUrl={callbackUrl} referer={referer} />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error initializing login page", {
      error: error,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });

    throw new Error("Error initializing login page", {
      cause: error,
    });
  }
}

export default LoginPage;
