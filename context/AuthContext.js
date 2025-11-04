"use client";

import { refreshSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { createContext, useState } from "react";
import { toast } from "react-toastify";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);

  const router = useRouter();

  /**
   * Met à jour le profil utilisateur via l'API qui utilise Better Auth
   */
  const updateProfile = async ({ name, phone, avatar, address }) => {
    try {
      setLoading(true);
      setError(null);

      // Validation basique côté client
      if (!name || name.trim() === "") {
        console.log("Le nom est obligatoire");
        setError("Le nom est obligatoire");
        setLoading(false);
        return;
      }

      // Préparer les données à envoyer
      const payload = {
        name: name.trim(),
        phone: phone ? phone.trim() : "",
        avatar,
        address,
      };

      // Simple fetch avec timeout court
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
          credentials: "include",
        },
      );

      clearTimeout(timeoutId);

      const data = await res.json();

      // Gestion simple des erreurs
      if (!res.ok) {
        let errorMessage = "";
        switch (res.status) {
          case 400:
            if (data.errors) {
              const firstErrorKey = Object.keys(data.errors)[0];
              errorMessage =
                data.errors[firstErrorKey] || "Données de profil invalides";
            } else {
              errorMessage = data.message || "Données de profil invalides";
            }
            break;
          case 401:
            errorMessage = "Session expirée. Veuillez vous reconnecter";
            setTimeout(() => router.push("/login"), 2000);
            break;
          case 429:
            errorMessage = "Trop de tentatives. Réessayez plus tard.";
            break;
          default:
            errorMessage = data.message || "Erreur lors de la mise à jour";
        }

        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        const isCritical = res.status === 401;
        console.error(httpError, "AuthContext", "updateProfile", isCritical);

        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (data.success && data.data?.updatedUser) {
        toast.success("Profil mis à jour avec succès!");
        setUser(data.data.updatedUser);
        setUpdated(true);

        // ✅ Vérifier si le serveur demande un refresh
        const sessionUpdated = res.headers.get("X-Session-Updated");

        // Retourner le succès (le refresh sera géré par le composant)
        return { success: true, sessionUpdated };
      }
    } catch (error) {
      // Erreurs réseau/système
      if (error.name === "AbortError") {
        setError("La requête a pris trop de temps");
        console.error(error, "AuthContext", "updateProfile", false);
      } else {
        setError("Problème de connexion. Vérifiez votre connexion.");
        console.error(error, "AuthContext", "updateProfile", true);
      }

      console.error("Profile update error:", error.message);
      throw error; // ✅ Remonter l'erreur pour que le composant puisse la gérer
    } finally {
      setLoading(false);
    }
  };

  /**
   * Met à jour le mot de passe utilisateur via l'API qui utilise Better Auth
   */
  const updatePassword = async ({
    currentPassword,
    newPassword,
    confirmPassword,
  }) => {
    try {
      setLoading(true);
      setError(null);

      // Validation basique côté client (juste les essentiels)
      if (!currentPassword || !newPassword) {
        const validationError = new Error("Tous les champs sont obligatoires");
        console.error(validationError, "AuthContext", "updatePassword", false);
        setError("Tous les champs sont obligatoires");
        setLoading(false);
        return;
      }

      if (currentPassword === newPassword) {
        const validationError = new Error(
          "Le nouveau mot de passe doit être différent",
        );
        console.error(validationError, "AuthContext", "updatePassword", false);
        setError("Le nouveau mot de passe doit être différent");
        setLoading(false);
        return;
      }

      if (newPassword.length < 8) {
        const validationError = new Error(
          "Minimum 8 caractères pour le nouveau mot de passe",
        );
        console.error(validationError, "AuthContext", "updatePassword", false);
        setError("Minimum 8 caractères pour le nouveau mot de passe");
        setLoading(false);
        return;
      }

      if (newPassword !== confirmPassword) {
        const validationError = new Error(
          "Le nouveau mot de passe et la confirmation ne correspondent pas",
        );
        console.error(validationError, "AuthContext", "updatePassword", false);
        setError(
          "Le nouveau mot de passe et la confirmation ne correspondent pas",
        );
        setLoading(false);
        return;
      }

      // Simple fetch avec timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update_password`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmPassword,
          }),
          signal: controller.signal,
          credentials: "include",
        },
      );

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        let errorMessage = "";
        switch (res.status) {
          case 400:
            errorMessage = data.message || "Mot de passe actuel incorrect";
            break;
          case 401:
            errorMessage = "Session expirée. Veuillez vous reconnecter";
            setTimeout(() => router.push("/login"), 2000);
            break;
          case 423:
            errorMessage = data.message || "Compte temporairement verrouillé";
            break;
          case 429:
            errorMessage = "Trop de tentatives. Réessayez plus tard.";
            break;
          default:
            errorMessage = data.message || "Erreur lors de la mise à jour";
        }

        // Monitoring pour erreurs HTTP - Critique si session expirée
        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        const isCritical = res.status === 401;
        console.error(httpError, "AuthContext", "updatePassword", isCritical);

        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (data.success) {
        toast.success("Mot de passe mis à jour avec succès!");

        // Redirection après mise à jour
        setTimeout(() => {
          router.push("/me");
          router.refresh(); // Force le rafraîchissement
        }, 1000);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        setError("La requête a pris trop de temps");
        console.error(error, "AuthContext", "updatePassword", false);
      } else {
        setError("Problème de connexion. Vérifiez votre connexion.");
        console.error(error, "AuthContext", "updatePassword", true);
      }
      console.error("Password update error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Envoie un email via l'API
   */
  const sendEmail = async ({ subject, message }) => {
    try {
      setLoading(true);
      setError(null);

      // Validation basique
      if (!subject || !subject.trim()) {
        const validationError = new Error("Le sujet est obligatoire");
        console.error(validationError, "AuthContext", "sendEmail", false);
        setError("Le sujet est obligatoire");
        setLoading(false);
        return;
      }

      if (!message || !message.trim()) {
        const validationError = new Error("Le message est obligatoire");
        console.error(validationError, "AuthContext", "sendEmail", false);
        setError("Le message est obligatoire");
        setLoading(false);
        return;
      }

      if (subject.length > 200) {
        const validationError = new Error(
          "Le sujet est trop long (max 200 caractères)",
        );
        console.error(validationError, "AuthContext", "sendEmail", false);
        setError("Le sujet est trop long (max 200 caractères)");
        setLoading(false);
        return;
      }

      if (message.length > 5000) {
        const validationError = new Error(
          "Le message est trop long (max 5000 caractères)",
        );
        console.error(validationError, "AuthContext", "sendEmail", false);
        setError("Le message est trop long (max 5000 caractères)");
        setLoading(false);
        return;
      }

      // Simple fetch avec timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s pour l'email

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ subject, message }),
        signal: controller.signal,
        credentials: "include",
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        let errorMessage = "";
        switch (res.status) {
          case 400:
            errorMessage = data.message || "Données invalides";
            break;
          case 401:
            errorMessage = "Session expirée. Veuillez vous reconnecter";
            setTimeout(() => router.push("/login"), 2000);
            break;
          case 404:
            errorMessage = "Utilisateur non trouvé";
            break;
          case 429:
            errorMessage = "Trop de tentatives. Réessayez plus tard.";
            break;
          case 503:
            errorMessage = "Service d'email temporairement indisponible";
            break;
          default:
            errorMessage = data.message || "Erreur lors de l'envoi";
        }

        // Monitoring pour erreurs HTTP - Critique pour 401/503
        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        const isCritical = [401, 503].includes(res.status);
        console.error(httpError, "AuthContext", "sendEmail", isCritical);

        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (data.success) {
        toast.success("Message envoyé avec succès!");
        router.push("/me");
      }
    } catch (error) {
      if (error.name === "AbortError") {
        setError("La requête a pris trop de temps");
        console.error(error, "AuthContext", "sendEmail", false);
      } else {
        setError("Problème de connexion. Vérifiez votre connexion.");
        console.error(error, "AuthContext", "sendEmail", true);
      }
      console.error("Email send error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Nettoie l'état utilisateur
   */
  const clearUser = () => {
    setUser(null);
    setError(null);
    setUpdated(false);
  };

  /**
   * Nettoie les erreurs
   */
  const clearErrors = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        error,
        loading,
        updated,
        setUpdated,
        setUser,
        setLoading,
        updateProfile,
        updatePassword,
        sendEmail,
        clearUser,
        clearErrors,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
