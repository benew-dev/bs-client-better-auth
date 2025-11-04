"use client";

import { useState, useEffect, useContext, useCallback, useRef } from "react";
import { CldImage, CldUploadWidget } from "next-cloudinary";
import { toast } from "react-toastify";
import DOMPurify from "dompurify";
import { countries } from "countries-list";

import AuthContext from "@/context/AuthContext";
import { captureException } from "@/monitoring/sentry";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Composant de mise à jour de profil utilisateur avec adresse
 */
const UpdateProfile = ({ userId, initialEmail, referer }) => {
  const { user, error, loading, updateProfile, clearErrors } =
    useContext(AuthContext);

  const formRef = useRef(null);
  const nameInputRef = useRef(null);
  const router = useRouter();

  // Format et tri des pays
  const countriesList = useCallback(() => {
    return Object.values(countries).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, []);

  // État du formulaire avec adresse
  const [formState, setFormState] = useState({
    name: "",
    phone: "",
    avatar: null,
    address: {
      street: "",
      city: "",
      country: "",
    },
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [formTouched, setFormTouched] = useState(false);

  // Initialisation des données
  useEffect(() => {
    if (user) {
      setFormState({
        name: user?.name || "",
        phone: user?.phone || "",
        avatar: user?.avatar || null,
        address: {
          street: user?.address?.street || "",
          city: user?.address?.city || "",
          country: user?.address?.country || "",
        },
      });
    }

    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [user]);

  // Gestion des erreurs
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearErrors();
      setIsSubmitting(false);
    }
  }, [error, clearErrors]);

  // Sanitization d'entrée
  const sanitizeInput = useCallback((value) => {
    if (typeof value === "string") {
      return DOMPurify.sanitize(value);
    }
    return value;
  }, []);

  // Gestionnaire de changement pour les champs normaux
  const handleInputChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      const sanitizedValue = sanitizeInput(value);

      setFormState((prevState) => ({
        ...prevState,
        [name]: sanitizedValue,
      }));

      setFormTouched(true);

      if (validationErrors[name]) {
        setValidationErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    },
    [sanitizeInput, validationErrors],
  );

  // Gestionnaire de changement pour les champs d'adresse
  const handleAddressChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      const sanitizedValue = sanitizeInput(value);

      setFormState((prevState) => ({
        ...prevState,
        address: {
          ...prevState.address,
          [name]: sanitizedValue,
        },
      }));

      setFormTouched(true);

      if (validationErrors[`address.${name}`]) {
        setValidationErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[`address.${name}`];
          return newErrors;
        });
      }
    },
    [sanitizeInput, validationErrors],
  );

  // Gestionnaires d'upload
  const handleUploadSuccess = useCallback((result) => {
    if (result?.info?.public_id && result?.info?.secure_url) {
      const publicId = result.info.public_id;
      const secureUrl = result.info.secure_url;

      if (!publicId.startsWith("buyitnow/avatars/")) {
        toast.error("Erreur de téléchargement: dossier incorrect");
        setUploadInProgress(false);
        return;
      }

      if (!secureUrl.startsWith("https://")) {
        toast.error("Erreur de téléchargement: URL non sécurisée");
        setUploadInProgress(false);
        return;
      }

      setFormState((prevState) => ({
        ...prevState,
        avatar: {
          public_id: publicId,
          url: secureUrl,
        },
      }));

      setFormTouched(true);
      setUploadInProgress(false);
      toast.success("Photo de profil téléchargée avec succès");
    }
  }, []);

  const handleUploadError = useCallback((error) => {
    console.error("Erreur de téléchargement:", error);
    setUploadInProgress(false);
    toast.error("Erreur lors du téléchargement de l'image");
  }, []);

  const handleUploadStart = useCallback(() => {
    setUploadInProgress(true);
  }, []);

  const handleGoBack = () => {
    router.back();
  };

  // Soumission du formulaire
  const submitHandler = async (e) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);

      if (uploadInProgress) {
        toast.info("Veuillez attendre la fin du téléchargement de l'image");
        setIsSubmitting(false);
        return;
      }

      const { name, phone, avatar, address } = formState;

      await updateProfile({ name, phone, avatar, address });

      setFormTouched(false);
      setValidationErrors({});

      if (process.env.NODE_ENV === "production") {
        console.info("Profile updated successfully", {
          userId: userId
            ? `${userId.substring(0, 2)}...${userId.slice(-2)}`
            : "unknown",
          hasAvatar: !!avatar,
          hasAddress: !!(address.street && address.city && address.country),
          referer: referer ? `${referer.substring(0, 10)}...` : "direct",
        });
      }
    } catch (error) {
      console.error("Erreur de mise à jour du profil:", error);
      toast.error(
        error.message ||
          "Une erreur est survenue lors de la mise à jour du profil",
      );

      if (process.env.NODE_ENV === "production") {
        captureException(error, {
          tags: { component: "UpdateProfile", action: "submitHandler" },
          extra: { formTouched },
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Configuration Cloudinary
  const uploadOptions = {
    folder: "buyitnow/avatars",
    maxFiles: 1,
    maxFileSize: 2000000,
    resourceType: "image",
    clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
    sources: ["local", "camera"],
    multiple: false,
    showUploadMoreButton: false,
    showPoweredBy: false,
  };

  // Fonction pour obtenir la classe CSS des inputs
  const getInputClassName = (fieldName) => {
    const baseClass =
      "appearance-none border rounded-md py-2 px-3 w-full transition-colors duration-200";

    if (validationErrors[fieldName]) {
      return `${baseClass} border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-500`;
    }

    return `${baseClass} border-gray-200 bg-gray-100 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500`;
  };

  return (
    <div className="mb-8 p-4 md:p-7 mx-auto rounded-lg bg-white shadow-lg max-w-lg">
      {/* Bouton de retour */}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleGoBack}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          aria-label="Retourner à la page précédente"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </button>
      </div>

      <form
        ref={formRef}
        onSubmit={submitHandler}
        encType="multipart/form-data"
        aria-label="Formulaire de mise à jour de profil"
        noValidate
      >
        <h2 className="mb-5 text-2xl font-semibold">Modifier votre profil</h2>

        {/* Email en lecture seule */}
        {initialEmail && (
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block mb-1 font-medium text-gray-700"
            >
              Adresse email (non modifiable)
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 w-full opacity-75 cursor-not-allowed"
              value={initialEmail}
              disabled
              readOnly
            />
            <p className="mt-1 text-xs text-gray-500">
              Pour modifier votre email, contactez le support.
            </p>
          </div>
        )}

        {/* Nom */}
        <div className="mb-4">
          <label
            htmlFor="name"
            className="block mb-1 font-medium text-gray-700"
          >
            Nom complet <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            ref={nameInputRef}
            type="text"
            placeholder="Votre nom complet"
            required
            className={getInputClassName("name")}
            value={formState.name}
            onChange={handleInputChange}
            aria-invalid={!!validationErrors.name}
            aria-describedby={validationErrors.name ? "name-error" : undefined}
            maxLength={50}
          />
          {validationErrors.name && (
            <p id="name-error" className="mt-1 text-sm text-red-600">
              {validationErrors.name}
            </p>
          )}
        </div>

        {/* Téléphone */}
        <div className="mb-4">
          <label
            htmlFor="phone"
            className="block mb-1 font-medium text-gray-700"
          >
            Numéro de téléphone <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="Votre numéro de téléphone"
            required
            inputMode="tel"
            className={getInputClassName("phone")}
            value={formState.phone}
            onChange={handleInputChange}
            aria-invalid={!!validationErrors.phone}
            aria-describedby={
              validationErrors.phone ? "phone-error" : undefined
            }
            maxLength={15}
          />
          {validationErrors.phone && (
            <p id="phone-error" className="mt-1 text-sm text-red-600">
              {validationErrors.phone}
            </p>
          )}
        </div>

        {/* SECTION ADRESSE */}
        <div className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Adresse</h3>

          {/* Rue */}
          <div className="mb-4">
            <label
              htmlFor="street"
              className="block mb-1 font-medium text-gray-700"
            >
              Rue / Voie
            </label>
            <input
              id="street"
              name="street"
              type="text"
              placeholder="Saisissez votre adresse"
              className={getInputClassName("address.street")}
              value={formState.address.street}
              onChange={handleAddressChange}
              aria-invalid={!!validationErrors["address.street"]}
              aria-describedby={
                validationErrors["address.street"] ? "street-error" : undefined
              }
              maxLength={100}
            />
            {validationErrors["address.street"] && (
              <p id="street-error" className="mt-1 text-sm text-red-600">
                {validationErrors["address.street"]}
              </p>
            )}
          </div>

          {/* Ville */}
          <div className="mb-4">
            <label
              htmlFor="city"
              className="block mb-1 font-medium text-gray-700"
            >
              Ville
            </label>
            <input
              id="city"
              name="city"
              type="text"
              placeholder="Saisissez votre ville"
              className={getInputClassName("address.city")}
              value={formState.address.city}
              onChange={handleAddressChange}
              aria-invalid={!!validationErrors["address.city"]}
              aria-describedby={
                validationErrors["address.city"] ? "city-error" : undefined
              }
              maxLength={50}
            />
            {validationErrors["address.city"] && (
              <p id="city-error" className="mt-1 text-sm text-red-600">
                {validationErrors["address.city"]}
              </p>
            )}
          </div>

          {/* Pays */}
          <div className="mb-4">
            <label
              htmlFor="country"
              className="block mb-1 font-medium text-gray-700"
            >
              Pays
            </label>
            <select
              id="country"
              name="country"
              className={getInputClassName("address.country")}
              value={formState.address.country}
              onChange={handleAddressChange}
              aria-invalid={!!validationErrors["address.country"]}
              aria-describedby={
                validationErrors["address.country"]
                  ? "country-error"
                  : undefined
              }
            >
              <option value="">Sélectionnez un pays</option>
              {countriesList().map((country) => (
                <option key={country.name} value={country.name}>
                  {country.name}
                </option>
              ))}
            </select>
            {validationErrors["address.country"] && (
              <p id="country-error" className="mt-1 text-sm text-red-600">
                {validationErrors["address.country"]}
              </p>
            )}
          </div>
        </div>

        {/* Photo de profil */}
        <div className="mb-6">
          <label className="block mb-1 font-medium text-gray-700">
            Photo de profil
          </label>
          <div className="flex flex-col md:flex-row items-start gap-4">
            <div className="flex items-center space-x-3 cursor-default">
              <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200">
                {uploadInProgress ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                    <LoaderCircle className="animate-spin h-6 w-6 text-blue-600" />
                  </div>
                ) : (
                  <CldImage
                    className="w-full h-full object-cover"
                    src={formState.avatar?.public_id || "/images/default.png"}
                    width={80}
                    height={80}
                    alt="Photo de profil"
                  />
                )}
              </div>
            </div>
            <div className="flex-grow">
              <CldUploadWidget
                signatureEndpoint={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me/update/sign-cloudinary-params`}
                onSuccess={handleUploadSuccess}
                onError={handleUploadError}
                onStart={handleUploadStart}
                options={uploadOptions}
                uploadPreset={undefined}
              >
                {({ open }) => {
                  const handleOpenClick = () => {
                    if (typeof open === "function") {
                      open();
                    } else {
                      console.error(
                        "L'API Cloudinary n'est pas correctement initialisée",
                      );
                      toast.error(
                        "Impossible d'ouvrir le sélecteur d'image. Veuillez réessayer.",
                      );
                    }
                  };

                  return (
                    <button
                      type="button"
                      className="px-4 py-2 text-center w-full md:w-auto inline-block text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleOpenClick}
                      disabled={uploadInProgress || isSubmitting}
                    >
                      {uploadInProgress
                        ? "Téléchargement en cours..."
                        : "Changer ma photo de profil"}
                    </button>
                  );
                }}
              </CldUploadWidget>
              <p className="mt-2 text-xs text-gray-500">
                Formats acceptés: JPG, PNG, WEBP. Taille maximale: 2 Mo
              </p>
            </div>
          </div>
        </div>

        {/* Erreurs générales */}
        {validationErrors.general && (
          <div className="mb-4 p-3 bg-red-50 border border-red-400 rounded text-red-700">
            {validationErrors.general}
          </div>
        )}

        {/* Bouton de soumission */}
        <button
          type="submit"
          className={`my-2 px-4 py-2 text-center w-full inline-block text-white rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            isSubmitting || uploadInProgress || loading
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
          }`}
          disabled={isSubmitting || uploadInProgress || loading}
        >
          {isSubmitting || loading ? (
            <span className="flex items-center justify-center">
              <LoaderCircle className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
              Mise à jour en cours...
            </span>
          ) : (
            "Mettre à jour mon profil"
          )}
        </button>
      </form>
    </div>
  );
};

export default UpdateProfile;
