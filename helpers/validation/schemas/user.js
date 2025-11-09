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

// ========================================
// 1. SCHÉMA POUR NOM + IMAGE (Better Auth)
// ========================================
export const profileBasicSchema = yup.object().shape({
  name: baseFields.name,
  image: yup
    .string()
    .nullable()
    .url("URL d'image invalide")
    .test(
      "https",
      "URL non sécurisée",
      (value) => !value || value.startsWith("https://"),
    )
    .default(null),
});

// ========================================
// 2. SCHÉMA POUR PHONE + ADRESSE (API Custom)
// ========================================
export const profileContactSchema = yup.object().shape({
  phone: baseFields.phone,

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

// ========================================
// 3. SCHÉMA LEGACY (pour compatibilité si besoin)
// ========================================
export const profileSchema = yup.object().shape({
  name: baseFields.name,
  phone: baseFields.phone,

  // ✅ CHANGEMENT: avatar devient image (URL simple)
  image: yup
    .string()
    .nullable()
    .url("URL d'image invalide")
    .test(
      "https",
      "URL non sécurisée",
      (value) => !value || value.startsWith("https://"),
    )
    .default(null),

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

// ========================================
// FONCTIONS DE VALIDATION
// ========================================
export const validateProfile = (data) => validate(profileSchema, data);
export const validateProfileBasic = (data) =>
  validate(profileBasicSchema, data);
export const validateProfileContact = (data) =>
  validate(profileContactSchema, data);
export const validateProfileWithLogging = validateProfile;
