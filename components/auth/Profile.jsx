"use client";

import { memo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  EllipsisVertical,
  Lock,
  Pencil,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

const Profile = () => {
  const { data: session, status } = useSession(); // ✅ Obtenir la session
  const user = session?.user; // ✅ Extraire l'utilisateur de la session

  const [isClient, setIsClient] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const modalRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    const handleClickOutside = (event) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target) &&
        !event.target.closest(".dots-button")
      ) {
        setIsModalOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    cleanupRef.current = () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };

    return cleanupRef.current;
  }, [isModalOpen]);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  const toggleModal = (e) => {
    e.stopPropagation();
    setIsModalOpen(!isModalOpen);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Skeleton loading
  if (status === "loading" || !isClient || !user) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-4">
            <div className="w-24 h-24 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6 h-48"></div>
      </div>
    );
  }

  const userData = {
    name: user?.name || "User",
    email: user?.email || "Aucun email",
    phone: user?.phone || "Aucun téléphone",
    avatarUrl: imageError
      ? "/images/default.png"
      : user?.avatar?.url || "/images/default.png",
    address: user?.address || null,
  };

  const hasAddress =
    userData.address?.street &&
    userData.address?.city &&
    userData.address?.country;

  return (
    <div className="space-y-6">
      {/* Card principale du profil */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Header avec avatar et actions */}
        <div className="relative bg-gradient-to-r from-blue-500 to-blue-600 h-24"></div>

        <div className="relative px-6 pb-6">
          {/* Avatar */}
          <div className="flex items-start justify-between -mt-12">
            <div className="relative">
              <div className="relative w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden bg-white">
                <Image
                  className="object-cover"
                  src={userData.avatarUrl}
                  alt={`${userData.name}'s profile picture`}
                  fill
                  sizes="96px"
                  priority
                  onError={() => setImageError(true)}
                  quality={75}
                />
              </div>
            </div>

            {/* Menu actions */}
            <div className="relative mt-4">
              <button
                onClick={toggleModal}
                className="dots-button p-2 text-gray-600 hover:text-gray-900 rounded-full transition-colors"
                aria-label="Plus d'options"
                aria-expanded={isModalOpen}
                aria-haspopup="true"
              >
                <EllipsisVertical
                  className="w-5 h-5 cursor-pointer"
                  color="#ffffff"
                />
              </button>

              {isModalOpen && (
                <div
                  ref={modalRef}
                  className="actions-modal absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
                  role="menu"
                  aria-orientation="vertical"
                >
                  <div className="absolute -top-2 right-3 w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45"></div>

                  <Link
                    href="/me/update"
                    onClick={closeModal}
                    className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-800 transition-colors"
                    role="menuitem"
                  >
                    <Pencil className="w-4 h-4 mr-3 text-orange-600" />
                    <span>Modifier le profil</span>
                  </Link>

                  <Link
                    href="/me/update_password"
                    onClick={closeModal}
                    className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                    role="menuitem"
                  >
                    <Lock className="w-4 h-4 mr-3 text-blue-600" />
                    <span>Changer le mot de passe</span>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Informations de contact */}
          <div className="mt-6 space-y-4">
            {/* Email */}
            <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Adresse email
                </p>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {userData.email}
                </p>
              </div>
            </div>

            {/* Téléphone */}
            <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Numéro de téléphone
                </p>
                <p className="mt-1 text-sm text-gray-900">{userData.phone}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card adresse */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-blue-600" />
              Adresse
            </h3>
          </div>
        </div>

        <div className="px-6 py-6">
          {hasAddress ? (
            <div className="space-y-2">
              <div className="flex items-start">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {userData.address.street}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {userData.address.city}
                  </p>
                  <p className="text-sm text-gray-600">
                    {userData.address.country}
                  </p>
                </div>
              </div>

              {/* Badge visuel pour l'adresse complète */}
              <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <svg
                  className="w-3 h-3 mr-1.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Adresse complète
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <MapPin className="w-8 h-8 text-gray-400" />
              </div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Aucune adresse enregistrée
              </h4>
              <p className="text-sm text-gray-500 mb-4">
                Ajoutez votre adresse pour faciliter vos commandes
              </p>
              <Link
                href="/me/update"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Ajouter mon adresse
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(Profile);
