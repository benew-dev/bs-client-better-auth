"use client";

import { useRouter } from "next/navigation";
import { createContext, useState } from "react";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react"; // ✅ AJOUT

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);

  const router = useRouter();
  // ✅ MODIFICATION: Gestion sécurisée de useSession
  // eslint-disable-next-line no-unused-vars
  const { data: session, update: updateSession } = useSession();

  // ✅ NOUVELLE fonction pour synchroniser l'utilisateur avec session complète
  // 1. METTRE À JOUR syncUserWithSession pour inclure l'adresse :

  const syncUserWithSession = async (updatedUserData) => {
    const currentUser = user;

    // Créer un utilisateur complet avec l'adresse
    const syncedUser = {
      ...currentUser,
      name: updatedUserData.name || currentUser?.name,
      phone: updatedUserData.phone || currentUser?.phone,
      avatar: updatedUserData.avatar || currentUser?.avatar,
      address: updatedUserData.address || currentUser?.address, // ✅ AJOUT
    };

    console.log("Syncing user with session:", {
      before: currentUser,
      received: updatedUserData,
      synced: syncedUser,
    });

    setUser(syncedUser);

    if (updateSession && typeof updateSession === "function") {
      try {
        await updateSession({
          user: syncedUser,
        });
        console.log("Session updated successfully");
      } catch (error) {
        console.warn("Failed to update session:", error);
      }
    } else {
      console.warn("UpdateSession not available, skipping session sync");
    }

    return syncedUser;
  };

  const registerUser = async ({ name, phone, email, password }) => {
    try {
      setLoading(true);
      setError(null);

      // 3. Simple fetch avec timeout court
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s comme vos APIs

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ name, phone, email, password }),
          signal: controller.signal,
          credentials: "include",
        },
      );

      clearTimeout(timeoutId);

      const data = await res.json();

      // 4. Gestion simple des erreurs (comme vos APIs)
      if (!res.ok) {
        let errorMessage = "";
        switch (res.status) {
          case 400:
            errorMessage = data.message || "Données d'inscription invalides";
            break;
          case 409:
            errorMessage = "Cet email est déjà utilisé";
            break;
          case 429:
            errorMessage = "Trop de tentatives. Réessayez plus tard.";
            break;
          default:
            errorMessage = data.message || "Erreur lors de l'inscription";
        }

        // Monitoring Sentry pour erreurs HTTP (non-critiques car attendues)
        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        console.error(httpError, "AuthContext", "registerUser", false);

        setError(errorMessage);
        setLoading(false);
        return;
      }

      // 5. Succès
      if (data.success) {
        toast.success("Inscription réussie!");
        setTimeout(() => router.push("/login"), 1000);
      }
    } catch (error) {
      // 6. Erreurs réseau/système - Monitoring critique
      if (error.name === "AbortError") {
        setError("La requête a pris trop de temps");
        console.error(error, "AuthContext", "registerUser", false);
      } else {
        setError("Problème de connexion. Vérifiez votre connexion.");
        // Erreur réseau critique
        console.error(error, "AuthContext", "registerUser", true);
      }

      console.error("Registration error:", error.message);
    } finally {
      setLoading(false);
    }
  };

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
            // Afficher les erreurs de validation spécifiques si disponibles
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

        // Monitoring pour erreurs HTTP
        const httpError = new Error(`HTTP ${res.status}: ${errorMessage}`);
        const isCritical = res.status === 401; // Session expirée = critique
        console.error(httpError, "AuthContext", "updateProfile", isCritical);

        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Succès
      if (data.success && data.data?.updatedUser) {
        console.log("User before update:", user);
        console.log("Updated user data:", data.data.updatedUser);

        // ✅ IMPORTANT: Appeler update() de NextAuth pour rafraîchir la session
        if (updateSession) {
          await updateSession({
            ...data.data.updatedUser,
            trigger: "update",
          });
        }

        // Synchroniser avec la session
        const syncedUser = await syncUserWithSession(data.data.updatedUser);

        console.log("User after sync:", syncedUser);

        toast.success("Profil mis à jour avec succès!");

        // Attendre un peu que la session soit mise à jour avant de rediriger
        setTimeout(() => {
          router.push("/me");
        }, 500);
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
    } finally {
      setLoading(false);
    }
  };

  // ... resto des méthodes inchangées

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
        router.replace("/me");
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

  // Ajoutez cette méthode
  const clearUser = () => {
    setUser(null);
    setError(null);
    setUpdated(false);
  };

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
        registerUser,
        updateProfile,
        updatePassword,
        sendEmail,
        clearUser,
        clearErrors,
        syncUserWithSession, // ✅ AJOUT: Exposer la fonction si besoin ailleurs
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
