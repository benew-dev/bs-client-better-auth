/**
 * Schémas de validation pour les profils utilisateur
 */

import * as yup from "yup";
import {
  createBaseFields,
  validate,
  sanitizeString,
  noNoSqlInjection,
} from "../core/utils";

const baseFields = createBaseFields();

// Schéma de profil utilisateur AVEC adresse
export const profileSchema = yup.object().shape({
  name: baseFields.name,
  phone: baseFields.phone,
  avatar: yup
    .object()
    .nullable()
    .shape({
      public_id: yup.string().nullable(),
      url: yup
        .string()
        .nullable()
        .url("URL invalide")
        .test(
          "https",
          "URL non sécurisée",
          (value) => !value || value.startsWith("https://"),
        ),
    })
    .default(null),

  // NOUVEAU: Schéma d'adresse intégré
  address: yup
    .object()
    .nullable()
    .shape({
      street: yup
        .string()
        .nullable()
        .transform((value) => (value ? sanitizeString(value) : null))
        .min(3, "Minimum 3 caractères")
        .max(100, "Maximum 100 caractères")
        .matches(/^[a-zA-Z0-9\s,.'°-]+$/, "Caractères non autorisés")
        .test("no-nosql", "Format invalide", noNoSqlInjection),

      city: yup
        .string()
        .nullable()
        .transform((value) => (value ? sanitizeString(value) : null))
        .min(2, "Minimum 2 caractères")
        .max(50, "Maximum 50 caractères")
        .matches(/^[a-zA-Z\s'\-\u00C0-\u017F]+$/, "Caractères non autorisés"),

      country: yup
        .string()
        .nullable()
        .transform((value) => (value ? sanitizeString(value) : null))
        .min(2, "Minimum 2 caractères")
        .max(50, "Maximum 50 caractères")
        .matches(/^[a-zA-Z\s'\-\u00C0-\u017F]+$/, "Caractères non autorisés"),
    })
    .default(null),
});

// Schéma de vérification d'email (inchangé)
export const emailVerificationSchema = yup.object().shape({
  token: yup
    .string()
    .required("Token requis")
    .matches(/^[a-zA-Z0-9]{32,128}$/, "Token invalide"),
});

// Fonctions de validation
export const validateProfile = (data) => validate(profileSchema, data);
export const validateProfileWithLogging = validateProfile;
export const validateEmailVerification = (data) =>
  validate(emailVerificationSchema, data);
