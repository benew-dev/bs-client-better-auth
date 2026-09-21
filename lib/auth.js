// lib/auth.js
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import dbConnect from "@/backend/config/dbConnect";
import logger from "@/utils/logger";
import { captureException } from "@/monitoring/sentry";

/**
 * Récupère l'instance MongoDB native depuis Mongoose
 * @returns {Promise<Db>} Instance de la base de données MongoDB
 */
const getMongoDbInstance = async () => {
  try {
    // 1. Établir la connexion via ton système existant
    const mongooseInstance = await dbConnect();

    if (!mongooseInstance || !mongooseInstance.connection) {
      throw new Error("Mongoose connection not established");
    }

    // 2. Vérifier que la connexion est active
    if (mongooseInstance.connection.readyState !== 1) {
      throw new Error(
        `MongoDB not ready. Current state: ${mongooseInstance.connection.readyState}`,
      );
    }

    // 3. Récupérer le client MongoDB natif
    const nativeClient = mongooseInstance.connection.getClient();

    if (!nativeClient) {
      throw new Error("Unable to retrieve native MongoDB client from Mongoose");
    }

    // 4. Récupérer l'instance de la base de données
    const db = nativeClient.db();

    if (!db) {
      throw new Error("Unable to retrieve database instance");
    }

    logger.info("MongoDB instance retrieved successfully for better-auth", {
      dbName: db.databaseName,
      host: mongooseInstance.connection.host,
    });

    return db;
  } catch (error) {
    logger.error("Failed to get MongoDB instance for better-auth", {
      error: error.message,
      stack: error.stack,
    });

    captureException(error, {
      tags: {
        service: "better-auth",
        action: "get-db-instance",
      },
      level: "fatal",
    });

    throw error;
  }
};

/**
 * Initialise better-auth avec la connexion MongoDB existante
 */
const initializeBetterAuth = async () => {
  try {
    const db = await getMongoDbInstance();

    return betterAuth({
      database: mongodbAdapter(db),

      // Email/Password avec validation stricte
      emailAndPassword: {
        enabled: true,
        autoSignIn: false,
        minPasswordLength: 8,
        maxPasswordLength: 100,

        // Validation personnalisée du mot de passe
        password: {
          validate: (password) => {
            const regex =
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
            if (!regex.test(password)) {
              throw new Error(
                "Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial",
              );
            }
          },
        },
      },

      // Champs additionnels utilisateur
      user: {
        additionalFields: {
          phone: {
            type: "string",
            required: true,
            input: true,
          },
          role: {
            type: "string",
            required: false,
            defaultValue: "user",
            input: false,
          },
          address: {
            type: "object",
            required: false,
            defaultValue: { street: "", city: "", country: "" },
            input: true,
          },
          isActive: {
            type: "boolean",
            required: false,
            defaultValue: true,
            input: false,
          },
          lastLogin: {
            type: "date",
            required: false,
            defaultValue: null,
            input: false,
          },
          loginAttempts: {
            type: "number",
            required: false,
            defaultValue: 0,
            input: false,
          },
          lockUntil: {
            type: "date",
            required: false,
            defaultValue: null,
            input: false,
          },
        },
      },

      // Configuration session (24h)
      session: {
        expiresIn: 60 * 60 * 24, // 24 heures
        updateAge: 60 * 60 * 24,
        cookieCache: {
          enabled: true,
          maxAge: 60 * 5, // 5 minutes
        },
      },

      // Hooks pour logique métier personnalisée
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              // Validation du nom
              if (user.name && !/^[a-zA-Z0-9\s._-]+$/.test(user.name)) {
                throw new Error("Le nom contient des caractères invalides");
              }

              // Validation du téléphone
              if (
                user.phone &&
                !/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/.test(
                  user.phone,
                )
              ) {
                throw new Error("Numéro de téléphone invalide");
              }

              return { data: user };
            },

            after: async (user) => {
              logger.info(`✅ Utilisateur créé via better-auth: ${user.email}`);
              // Ici tu pourrais envoyer un email de bienvenue
            },
          },

          update: {
            before: async (data, ctx) => {
              // Vérifier si le compte est verrouillé
              if (data.lockUntil && new Date(data.lockUntil) > new Date()) {
                throw new Error("Compte temporairement verrouillé");
              }

              return { data };
            },
          },
        },

        // ✅ NOUVEAU : Ajouter des hooks pour l'account (changement de mot de passe)
        // Dans lib/auth.js, dans databaseHooks

        account: {
          update: {
            before: async (data, ctx) => {
              try {
                const db = await getMongoDbInstance();

                // ✅ CORRECTION : userId est dans data, pas dans ctx
                const userId = data.userId || data.id;

                if (!userId) {
                  logger.error("No userId found in account update data");
                  return { data };
                }

                // Récupérer l'utilisateur pour vérifier son statut
                const user = await db
                  .collection("user")
                  .findOne({ id: userId });

                if (!user) {
                  logger.warn("User not found for password change:", userId);
                  throw new Error("Utilisateur non trouvé");
                }

                // 1. Vérifier si le compte est actif
                if (user.isActive === false) {
                  logger.warn(
                    "Password change attempt on suspended account:",
                    user.email,
                  );
                  throw new Error(
                    "Compte suspendu. Impossible de changer le mot de passe.",
                  );
                }

                // 2. Vérifier si le compte est verrouillé
                const isLocked =
                  user.lockUntil && new Date(user.lockUntil) > new Date();
                if (isLocked) {
                  const lockUntilFormatted = new Date(
                    user.lockUntil,
                  ).toLocaleString("fr-FR");
                  logger.warn(
                    "Password change attempt on locked account:",
                    user.email,
                  );
                  throw new Error(
                    `Compte temporairement verrouillé jusqu'à ${lockUntilFormatted}`,
                  );
                }

                logger.info(
                  "Password change validation passed for:",
                  user.email,
                );
                return { data };
              } catch (error) {
                logger.error(
                  "Error in account update before hook:",
                  error.message,
                );
                throw error;
              }
            },

            after: async (data, ctx) => {
              try {
                const db = await getMongoDbInstance();

                // ✅ CORRECTION : userId est dans data, pas dans ctx
                const userId = data.userId || data.id;

                if (!userId) {
                  logger.error("No userId found in account update after hook");
                  return;
                }

                // Réinitialiser les tentatives échouées et mettre à jour passwordChangedAt
                await db.collection("user").updateOne(
                  { id: userId },
                  {
                    $set: {
                      loginAttempts: 0,
                      passwordChangedAt: new Date(),
                    },
                    $unset: { lockUntil: 1 },
                  },
                );

                logger.info(
                  `✅ Password updated successfully for userId: ${userId}`,
                );

                // Log de sécurité pour audit
                logger.info("🔒 Security event - Password changed:", {
                  userId: userId,
                  timestamp: new Date().toISOString(),
                });
              } catch (error) {
                logger.error(
                  "Error in account update after hook:",
                  error.message,
                );
                // Ne pas bloquer si la mise à jour échoue
                captureException(error, {
                  tags: {
                    service: "better-auth",
                    hook: "account-update-after",
                  },
                  level: "warning",
                });
              }
            },
          },
        },

        session: {
          create: {
            after: async (session) => {
              try {
                // Récupérer l'instance DB pour les opérations
                const db = await getMongoDbInstance();

                // Mettre à jour lastLogin et réinitialiser les tentatives
                await db.collection("user").updateOne(
                  { id: session.userId },
                  {
                    $set: {
                      lastLogin: new Date(),
                      loginAttempts: 0,
                    },
                    $unset: { lockUntil: 1 },
                  },
                );

                logger.info(`Session créée pour userId: ${session.userId}`);
              } catch (error) {
                logger.error("Erreur lors de la mise à jour après session", {
                  error: error.message,
                  userId: session.userId,
                });

                // Ne pas bloquer la création de session si la mise à jour échoue
                captureException(error, {
                  tags: {
                    service: "better-auth",
                    hook: "session-create-after",
                  },
                  level: "warning",
                });
              }
            },
          },
        },
      },

      // Rate limiting intégré
      rateLimit: {
        enabled: true,
        window: 60, // 1 minute
        max: 10, // 10 tentatives
      },

      // Sécurité des cookies
      advanced: {
        cookiePrefix: process.env.NODE_ENV === "production" ? "__Secure-" : "",
        useSecureCookies: process.env.NODE_ENV === "production",
      },

      trustedOrigins: [
        process.env.BETTER_AUTH_URL ||
          "https://bs-client-better-auth.vercel.app",
      ],

      secret: process.env.BETTER_AUTH_SECRET,
    });
  } catch (error) {
    logger.error("Failed to initialize better-auth", {
      error: error.message,
      stack: error.stack,
    });

    captureException(error, {
      tags: {
        service: "better-auth",
        action: "initialize",
      },
      level: "fatal",
    });

    throw error;
  }
};

// Export de l'instance auth (initialisée de manière lazy)
let authInstance = null;

export const auth = new Proxy(
  {},
  {
    get: (target, prop) => {
      if (!authInstance) {
        throw new Error(
          "Auth not initialized. Call initializeAuth() first or use getAuth()",
        );
      }
      return authInstance[prop];
    },
  },
);

/**
 * Récupère l'instance auth (l'initialise si nécessaire)
 * @returns {Promise<BetterAuth>}
 */
export const getAuth = async () => {
  if (!authInstance) {
    authInstance = await initializeBetterAuth();
  }
  return authInstance;
};

/**
 * Initialise explicitement l'authentification au démarrage de l'app
 * @returns {Promise<BetterAuth>}
 */
export const initializeAuth = async () => {
  try {
    logger.info("Initializing better-auth...");
    authInstance = await initializeBetterAuth();
    logger.info("Better-auth initialized successfully");
    return authInstance;
  } catch (error) {
    logger.error("Failed to initialize auth on startup", {
      error: error.message,
    });
    throw error;
  }
};
