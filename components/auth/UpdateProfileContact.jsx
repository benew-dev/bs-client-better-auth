"use client";

import { useState, useEffect, useContext, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import { countries } from "countries-list";
import AuthContext from "@/context/AuthContext";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const UpdateProfileContact = () => {
  const { data: session, refetch } = useSession();
  const user = session?.user;

  const { error, loading, updateProfile, clearErrors } =
    useContext(AuthContext);
  const router = useRouter();

  const phoneInputRef = useRef(null);

  const countriesList = useCallback(() => {
    return Object.values(countries).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, []);

  const [formState, setFormState] = useState({
    phone: "",
    address: {
      street: "",
      city: "",
      country: "",
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFormState({
        phone: user?.phone || "",
        address: {
          street: user?.address?.street || "",
          city: user?.address?.city || "",
          country: user?.address?.country || "",
        },
      });
    }

    if (phoneInputRef.current) {
      phoneInputRef.current.focus();
    }
  }, [user]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearErrors();
      setIsSubmitting(false);
    }
  }, [error, clearErrors]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddressChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      address: {
        ...prev.address,
        [name]: value,
      },
    }));
  };

  const submitHandler = async (e) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);

      const { phone, address } = formState;

      // ✅ Appel de l'API custom via AuthContext
      await updateProfile({ phone, address });

      // ✅ Refetch la session
      await refetch();

      toast.success("Informations de contact mises à jour!");

      setTimeout(() => {
        router.push("/me");
      }, 500);
    } catch (error) {
      console.error("Erreur de mise à jour:", error);
      toast.error(error.message || "Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="mb-8 p-4 md:p-7 mx-auto rounded-lg bg-white shadow-lg max-w-lg">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </button>

      <form onSubmit={submitHandler}>
        <h2 className="mb-5 text-2xl font-semibold">Informations de contact</h2>

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
            ref={phoneInputRef}
            type="tel"
            placeholder="Votre numéro de téléphone"
            required
            inputMode="tel"
            className="appearance-none border rounded-md py-2 px-3 w-full border-gray-200 bg-gray-100"
            value={formState.phone}
            onChange={handleInputChange}
            maxLength={15}
          />
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
              className="appearance-none border rounded-md py-2 px-3 w-full border-gray-200 bg-gray-100"
              value={formState.address.street}
              onChange={handleAddressChange}
              maxLength={100}
            />
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
              className="appearance-none border rounded-md py-2 px-3 w-full border-gray-200 bg-gray-100"
              value={formState.address.city}
              onChange={handleAddressChange}
              maxLength={50}
            />
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
              className="appearance-none border rounded-md py-2 px-3 w-full border-gray-200 bg-gray-100"
              value={formState.address.country}
              onChange={handleAddressChange}
            >
              <option value="">Sélectionnez un pays</option>
              {countriesList().map((country) => (
                <option key={country.name} value={country.name}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className={`my-2 px-4 py-2 text-center w-full inline-block text-white rounded-md ${
            isSubmitting || loading
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          disabled={isSubmitting || loading}
        >
          {isSubmitting || loading ? (
            <span className="flex items-center justify-center">
              <LoaderCircle className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
              Mise à jour en cours...
            </span>
          ) : (
            "Mettre à jour"
          )}
        </button>
      </form>
    </div>
  );
};

export default UpdateProfileContact;
