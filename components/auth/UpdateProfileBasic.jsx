"use client";

import { useState, useEffect, useRef } from "react";
import { CldImage, CldUploadWidget } from "next-cloudinary";
import { toast } from "react-toastify";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession, updateUser } from "@/lib/auth-client";

const UpdateProfileBasic = () => {
  const { data: session, refetch } = useSession();
  const user = session?.user;
  const router = useRouter();

  const [formState, setFormState] = useState({
    name: "",
    image: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadInProgress, setUploadInProgress] = useState(false);

  const nameInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setFormState({
        name: user?.name || "",
        image: user?.image || "",
      });
    }

    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleUploadSuccess = (result) => {
    if (result?.info?.secure_url) {
      const secureUrl = result.info.secure_url;

      if (!secureUrl.startsWith("https://")) {
        toast.error("Erreur de téléchargement: URL non sécurisée");
        setUploadInProgress(false);
        return;
      }

      setFormState((prev) => ({
        ...prev,
        image: secureUrl,
      }));

      setUploadInProgress(false);
      toast.success("Photo de profil téléchargée avec succès");
    }
  };

  const handleUploadError = (error) => {
    console.error("Erreur de téléchargement:", error);
    setUploadInProgress(false);
    toast.error("Erreur lors du téléchargement de l'image");
  };

  const handleUploadStart = () => {
    setUploadInProgress(true);
  };

  const submitHandler = async (e) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);

      if (uploadInProgress) {
        toast.info("Veuillez attendre la fin du téléchargement de l'image");
        setIsSubmitting(false);
        return;
      }

      const { name, image } = formState;

      // ✅ UTILISER updateUser de Better Auth
      await updateUser({
        name: name.trim(),
        image: image || null,
      });

      // ✅ Refetch la session
      refetch();

      toast.success("Profil mis à jour avec succès!");

      setTimeout(() => {
        router.push("/me");
      }, 500);
    } catch (error) {
      console.error("Erreur de mise à jour:", error);
      toast.error(
        error.message || "Une erreur est survenue lors de la mise à jour",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <h2 className="mb-5 text-2xl font-semibold">Modifier votre profil</h2>

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
            className="appearance-none border rounded-md py-2 px-3 w-full border-gray-200 bg-gray-100"
            value={formState.name}
            onChange={handleInputChange}
            maxLength={50}
          />
        </div>

        {/* Photo de profil */}
        <div className="mb-6">
          <label className="block mb-1 font-medium text-gray-700">
            Photo de profil
          </label>
          <div className="flex flex-col md:flex-row items-start gap-4">
            <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200">
              {uploadInProgress ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <LoaderCircle className="animate-spin h-6 w-6 text-blue-600" />
                </div>
              ) : (
                <CldImage
                  className="w-full h-full object-cover"
                  src={formState.image || "/images/default.png"}
                  width={80}
                  height={80}
                  alt="Photo de profil"
                />
              )}
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
                {({ open }) => (
                  <button
                    type="button"
                    className="px-4 py-2 text-center w-full md:w-auto inline-block text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50"
                    onClick={() => open()}
                    disabled={uploadInProgress || isSubmitting}
                  >
                    {uploadInProgress
                      ? "Téléchargement en cours..."
                      : "Changer ma photo de profil"}
                  </button>
                )}
              </CldUploadWidget>
              <p className="mt-2 text-xs text-gray-500">
                Formats acceptés: JPG, PNG, WEBP. Taille maximale: 2 Mo
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className={`my-2 px-4 py-2 text-center w-full inline-block text-white rounded-md ${
            isSubmitting || uploadInProgress
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          disabled={isSubmitting || uploadInProgress}
        >
          {isSubmitting ? (
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

export default UpdateProfileBasic;
