/**
 * Rate Limiter Intelligent avec stratégies différenciées
 * Optimisé pour e-commerce avec ~500 visiteurs/jour
 *
 * Features:
 * - Rate limiting différencié par type d'action (login, logout, payment, etc.)
 * - Comptage séparé des succès et échecs
 * - Whitelist automatique après connexion réussie
 * - Protection DDoS avec détection de patterns
 * - Support multi-stratégies par endpoint
 *
 * @version 3.0.0
 * @date 2025-10-06
 */

import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

/**
 * LRU Cache optimisé avec TTL
 */
class LRUCache extends Map {
  constructor(maxSize = 1000, ttl = 3600000) {
    super();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.timestamps = new Map();
  }

  set(key, value) {
    this.cleanup();

    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey);
      this.timestamps.delete(firstKey);
    }

    this.timestamps.set(key, Date.now());
    return super.set(key, value);
  }

  get(key) {
    const timestamp = this.timestamps.get(key);
    if (timestamp && Date.now() - timestamp > this.ttl) {
      this.delete(key);
      this.timestamps.delete(key);
      return undefined;
    }
    return super.get(key);
  }

  delete(key) {
    this.timestamps.delete(key);
    return super.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.timestamps.entries()) {
      if (now - timestamp > this.ttl) {
        this.delete(key);
      }
    }
  }

  clear() {
    this.timestamps.clear();
    return super.clear();
  }
}

/**
 * Configuration intelligente par type d'action
 * Stratégies différenciées pour chaque cas d'usage
 */
const INTELLIGENT_LIMITS = {
  // AUTH - Stratégies différenciées
  auth: {
    // Login failures - très strict
    loginFailure: {
      points: 5, // 5 échecs max
      duration: 900000, // par 15 minutes
      blockDuration: 1800000, // blocage 30 min
      keyStrategy: "ip+email", // Track par IP ET email
    },
    // Login success - permissif
    loginSuccess: {
      points: 30, // 30 connexions réussies
      duration: 60000, // par minute
      blockDuration: 60000, // blocage 1 min seulement
      keyStrategy: "ip",
    },
    // Logout - très permissif (pas de raison de limiter)
    logout: {
      points: 100, // 100 déconnexions
      duration: 60000, // par minute
      blockDuration: 0, // pas de blocage
      keyStrategy: "user",
    },
    // Session check - ultra permissif (appelé fréquemment)
    session: {
      points: 200, // 200 checks
      duration: 60000, // par minute
      blockDuration: 0,
      keyStrategy: "ip",
    },
    // Password reset - strict
    passwordReset: {
      points: 3, // 3 tentatives
      duration: 3600000, // par heure
      blockDuration: 3600000, // blocage 1h
      keyStrategy: "ip+email",
    },
  },

  // PAYMENT - Permissif pour les vrais utilisateurs
  payment: {
    // Webhook de paiement - permissif
    webhook: {
      points: 10, // 10 webhooks
      duration: 60000, // par minute
      blockDuration: 300000, // blocage 5 min
      keyStrategy: "user",
      requireAuth: true, // Doit être authentifié
    },
    // Création de commande - modéré
    createOrder: {
      points: 5, // 5 commandes
      duration: 300000, // par 5 minutes
      blockDuration: 600000, // blocage 10 min
      keyStrategy: "user",
      requireAuth: true,
    },
    // Vérification de paiement - permissif
    checkStatus: {
      points: 30, // 30 vérifications
      duration: 60000, // par minute
      blockDuration: 60000,
      keyStrategy: "user",
    },
  },

  // API - Stratégies par type
  api: {
    // Lecture publique - permissif
    publicRead: {
      points: 100, // 100 requêtes
      duration: 60000, // par minute
      blockDuration: 60000,
      keyStrategy: "ip",
    },
    // Lecture authentifiée - très permissif
    authenticatedRead: {
      points: 200, // 200 requêtes
      duration: 60000, // par minute
      blockDuration: 30000,
      keyStrategy: "user",
    },
    // Écriture - modéré
    write: {
      points: 30, // 30 écritures
      duration: 60000, // par minute
      blockDuration: 300000,
      keyStrategy: "user",
      requireAuth: true,
    },
    // Upload - strict
    upload: {
      points: 10, // 10 uploads
      duration: 300000, // par 5 minutes
      blockDuration: 600000,
      keyStrategy: "user",
      requireAuth: true,
    },
    // Recherche - modéré
    search: {
      points: 30, // 30 recherches
      duration: 60000, // par minute
      blockDuration: 120000,
      keyStrategy: "ip",
    },
  },

  // CART - Très permissif (UX critique)
  cart: {
    // Ajout au panier - ultra permissif
    add: {
      points: 100, // 100 ajouts
      duration: 60000, // par minute
      blockDuration: 0, // pas de blocage
      keyStrategy: "session",
    },
    // Mise à jour - permissif
    update: {
      points: 100,
      duration: 60000,
      blockDuration: 0,
      keyStrategy: "session",
    },
    // Suppression - permissif
    remove: {
      points: 50,
      duration: 60000,
      blockDuration: 0,
      keyStrategy: "session",
    },
  },
};

/**
 * Gestionnaire de rate limiting intelligent
 */
class IntelligentRateLimiter {
  constructor() {
    // Caches séparés par stratégie
    this.requestLogs = new LRUCache(3000, 3600000); // TTL 1h
    this.failures = new LRUCache(1000, 1800000); // TTL 30min
    this.blocked = new LRUCache(500, 1800000); // TTL 30min
    this.trustedUsers = new LRUCache(500, 86400000); // TTL 24h
    this.suspiciousActivity = new Map();

    // Whitelist permanente
    this.whitelist = new Set([
      "127.0.0.1",
      "::1",
      // Ajouter IPs de confiance
    ]);

    // Statistiques
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      failedLogins: 0,
      successfulLogins: 0,
    };

    this.startCleanupInterval();
  }

  /**
   * Extraction d'IP robuste
   */
  extractIP(req) {
    const headers = [
      "cf-connecting-ip",
      "x-real-ip",
      "x-forwarded-for",
      "x-client-ip",
    ];

    for (const header of headers) {
      const value = req.headers.get(header);
      if (value) {
        const ips = value.split(",").map((ip) => ip.trim());
        const validIP = ips.find((ip) => this.isValidIP(ip));
        if (validIP) return validIP;
      }
    }

    return req.ip || "0.0.0.0";
  }

  isValidIP(ip) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Génération de clé intelligente selon la stratégie
   */
  generateKey(strategy, { ip, userId, email, sessionId, action }) {
    const parts = [`rl:${action}`];

    switch (strategy.keyStrategy) {
      case "ip":
        parts.push(`ip:${ip}`);
        break;
      case "user":
        parts.push(`user:${userId || "anonymous"}`);
        break;
      case "ip+email":
        parts.push(`ip:${ip}`, `email:${email || "unknown"}`);
        break;
      case "ip+user":
        parts.push(`ip:${ip}`, `user:${userId || "anonymous"}`);
        break;
      case "session":
        parts.push(`session:${sessionId || ip}`);
        break;
      default:
        parts.push(`ip:${ip}`);
    }

    return parts.join(":");
  }

  /**
   * Vérification intelligente du rate limit
   */
  checkRateLimit(key, strategy) {
    const now = Date.now();
    const windowStart = now - strategy.duration;

    // Récupérer le log des requêtes
    let requestLog = this.requestLogs.get(key) || [];

    // Filtrer les requêtes dans la fenêtre
    requestLog = requestLog.filter((timestamp) => timestamp > windowStart);

    // Vérifier la limite
    const isLimited = requestLog.length >= strategy.points;

    if (!isLimited) {
      // Ajouter la requête actuelle
      requestLog.push(now);
      this.requestLogs.set(key, requestLog);
    }

    return {
      limited: isLimited,
      remaining: Math.max(0, strategy.points - requestLog.length),
      resetAt: windowStart + strategy.duration,
      retryAfter: isLimited
        ? Math.ceil((windowStart + strategy.duration - now) / 1000)
        : 0,
    };
  }

  /**
   * Gestion intelligente des échecs de connexion
   */
  handleLoginAttempt(ip, email, success) {
    const failureKey = `failures:${ip}:${email}`;

    if (success) {
      // Reset les compteurs d'échec en cas de succès
      this.failures.delete(failureKey);
      this.stats.successfulLogins++;

      // Ajouter à la liste de confiance temporaire
      this.trustedUsers.set(`trusted:${ip}`, {
        email,
        loginTime: Date.now(),
      });
    } else {
      // Incrémenter les échecs
      const failures = (this.failures.get(failureKey) || 0) + 1;
      this.failures.set(failureKey, failures);
      this.stats.failedLogins++;

      // Bloquer après trop d'échecs
      if (failures >= 5) {
        this.blockIP(ip, 1800000, "too_many_login_failures");
      }
    }
  }

  /**
   * Vérification si IP/User est bloqué
   */
  isBlocked(key) {
    const blockInfo = this.blocked.get(key);
    if (!blockInfo) return null;

    const now = Date.now();
    if (now < blockInfo.until) {
      return {
        blocked: true,
        until: blockInfo.until,
        reason: blockInfo.reason,
        retryAfter: Math.ceil((blockInfo.until - now) / 1000),
      };
    }

    this.blocked.delete(key);
    return null;
  }

  /**
   * Bloquer une IP/User
   */
  blockIP(ip, duration, reason) {
    if (duration === 0) return; // Pas de blocage si duration = 0

    const until = Date.now() + duration;
    this.blocked.set(`blocked:${ip}`, {
      until,
      reason,
      count: (this.blocked.get(`blocked:${ip}`)?.count || 0) + 1,
    });

    this.stats.blockedRequests++;
    console.warn(`[RATE_LIMIT] IP blocked: ${ip}, reason: ${reason}`);
  }

  /**
   * Détection d'activité suspecte
   */
  detectSuspiciousActivity(ip, action) {
    const key = `suspicious:${ip}`;
    const activity = this.suspiciousActivity.get(key) || {
      actions: [],
      firstSeen: Date.now(),
    };

    activity.actions.push({ action, timestamp: Date.now() });

    // Garder seulement les 100 dernières actions
    if (activity.actions.length > 100) {
      activity.actions = activity.actions.slice(-100);
    }

    this.suspiciousActivity.set(key, activity);

    // Analyser les patterns
    const recentActions = activity.actions.filter(
      (a) => Date.now() - a.timestamp < 60000, // Dernière minute
    );

    // Patterns suspects
    if (recentActions.length > 100) {
      // Plus de 100 actions/minute
      return "excessive_requests";
    }

    const failedLogins = recentActions.filter(
      (a) => a.action === "login_failure",
    ).length;
    if (failedLogins > 10) {
      // Plus de 10 échecs de connexion/minute
      return "brute_force_attempt";
    }

    return null;
  }

  /**
   * Vérifier si l'utilisateur est de confiance
   */
  isTrusted(ip, userId) {
    return (
      this.whitelist.has(ip) ||
      this.trustedUsers.has(`trusted:${ip}`) ||
      (userId && this.trustedUsers.has(`trusted:user:${userId}`))
    );
  }

  /**
   * Nettoyage périodique
   */
  startCleanupInterval() {
    if (typeof setInterval === "undefined") return;

    setInterval(() => {
      // Cleanup des caches
      this.requestLogs.cleanup();
      this.failures.cleanup();
      this.blocked.cleanup();
      this.trustedUsers.cleanup();

      // Cleanup des activités suspectes anciennes
      const now = Date.now();
      for (const [key, activity] of this.suspiciousActivity.entries()) {
        if (now - activity.firstSeen > 3600000) {
          // 1 heure
          this.suspiciousActivity.delete(key);
        }
      }

      // Log des stats
      if (process.env.NODE_ENV === "development") {
        console.log("[RATE_LIMIT] Stats:", this.stats);
      }
    }, 120000); // 2 minutes
  }

  /**
   * Récupérer les statistiques
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: {
        requests: this.requestLogs.size,
        failures: this.failures.size,
        blocked: this.blocked.size,
        trusted: this.trustedUsers.size,
      },
    };
  }
}

// Instance singleton
const intelligentLimiter = new IntelligentRateLimiter();

/**
 * Middleware principal avec stratégies intelligentes
 */
export function withIntelligentRateLimit(handler, options = {}) {
  const {
    category = "api",
    action = "publicRead",
    extractUserInfo = null,
    onSuccess = null,
    onFailure = null,
    customStrategy = null,
  } = options;

  return async function rateLimitedHandler(req, ...args) {
    try {
      const ip = intelligentLimiter.extractIP(req);

      // Récupérer les infos utilisateur
      let userInfo = { ip };

      // Si pas de fonction extractUserInfo fournie, essayer d'extraire le JWT par défaut
      if (!extractUserInfo || typeof extractUserInfo !== "function") {
        // Extraction par défaut du JWT pour les routes qui requireAuth
        const strategy =
          customStrategy ||
          INTELLIGENT_LIMITS[category]?.[action] ||
          INTELLIGENT_LIMITS.api.publicRead;

        if (strategy.requireAuth) {
          try {
            const cookieName =
              process.env.NODE_ENV === "production"
                ? "__Secure-next-auth.session-token"
                : "next-auth.session-token";

            const token = await getToken({
              req,
              secret: process.env.NEXTAUTH_SECRET,
              cookieName,
            });

            if (token?.user) {
              userInfo = {
                ...userInfo,
                userId: token.user._id || token.user.id || token.sub,
                email: token.user.email,
              };
            }
          } catch (error) {
            console.error("[RATE_LIMIT] Error extracting JWT:", error.message);
          }
        }
      } else {
        // Utiliser la fonction extractUserInfo fournie
        const extracted = await extractUserInfo(req);
        userInfo = { ...userInfo, ...extracted };
      }

      // Sélectionner la stratégie
      const strategy =
        customStrategy ||
        INTELLIGENT_LIMITS[category]?.[action] ||
        INTELLIGENT_LIMITS.api.publicRead;

      // Vérifier si l'utilisateur est de confiance (bypass partiel)
      const isTrusted = intelligentLimiter.isTrusted(ip, userInfo.userId);

      // Si trusted, doubler les limites
      const effectiveStrategy = isTrusted
        ? {
            ...strategy,
            points: strategy.points * 2,
            blockDuration: strategy.blockDuration / 2,
          }
        : strategy;

      // Vérifier si authentification requise
      if (strategy.requireAuth && !userInfo.userId) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 },
        );
      }

      // Générer la clé de rate limiting
      const key = intelligentLimiter.generateKey(effectiveStrategy, {
        ...userInfo,
        action: `${category}:${action}`,
      });

      // Vérifier si bloqué
      const blockInfo = intelligentLimiter.isBlocked(`blocked:${ip}`);
      if (blockInfo) {
        return NextResponse.json(
          {
            error: "Access temporarily blocked",
            reason: blockInfo.reason,
            retryAfter: blockInfo.retryAfter,
          },
          {
            status: 429,
            headers: {
              "Retry-After": blockInfo.retryAfter.toString(),
              "X-RateLimit-Policy": "429-blocked",
            },
          },
        );
      }

      // Détection d'activité suspecte
      const suspiciousType = intelligentLimiter.detectSuspiciousActivity(
        ip,
        `${category}:${action}`,
      );
      if (suspiciousType) {
        intelligentLimiter.blockIP(ip, 1800000, suspiciousType);
        return NextResponse.json(
          { error: "Suspicious activity detected" },
          { status: 429 },
        );
      }

      // Vérifier le rate limit
      const result = intelligentLimiter.checkRateLimit(key, effectiveStrategy);

      if (result.limited) {
        // Appeler le callback d'échec si fourni
        if (onFailure) {
          await onFailure(userInfo);
        }

        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            limit: effectiveStrategy.points,
            window: `${effectiveStrategy.duration / 1000}s`,
            retryAfter: result.retryAfter,
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": effectiveStrategy.points.toString(),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
              "Retry-After": result.retryAfter.toString(),
              "RateLimit-Limit": effectiveStrategy.points.toString(),
              "RateLimit-Remaining": "0",
              "RateLimit-Reset": result.retryAfter.toString(),
            },
          },
        );
      }

      // Exécuter le handler
      const response = await handler(req, ...args);

      // Appeler le callback de succès si fourni
      if (onSuccess) {
        await onSuccess(userInfo, response);
      }

      // Ajouter les headers de rate limit
      if (response instanceof NextResponse) {
        response.headers.set(
          "X-RateLimit-Limit",
          effectiveStrategy.points.toString(),
        );
        response.headers.set(
          "X-RateLimit-Remaining",
          result.remaining.toString(),
        );
        response.headers.set(
          "X-RateLimit-Reset",
          new Date(result.resetAt).toISOString(),
        );
      }

      // Incrémenter les stats
      intelligentLimiter.stats.totalRequests++;

      return response;
    } catch (error) {
      console.error("[RATE_LIMIT] Error:", error);
      // En cas d'erreur, laisser passer
      return handler(req, ...args);
    }
  };
}

/**
 * Helpers spécialisés pour l'authentification
 */
export const withAuthRateLimit = (handler, options = {}) => {
  return withIntelligentRateLimit(handler, {
    ...options,
    category: "auth",
    action: options.action || "loginSuccess",
    extractUserInfo: async (req) => {
      // Extraire l'email du body pour les logins
      try {
        const body = await req.clone().text();
        const email = body.match(/email=([^&]*)/)?.[1];
        return { email: email ? decodeURIComponent(email) : null };
      } catch {
        return {};
      }
    },
    onSuccess: async (userInfo) => {
      // Si c'est un login réussi, marquer comme trusted
      if (options.action === "loginSuccess" && userInfo.email) {
        intelligentLimiter.handleLoginAttempt(
          userInfo.ip,
          userInfo.email,
          true,
        );
      }
    },
    onFailure: async (userInfo) => {
      // Si c'est un échec de login
      if (options.action === "loginFailure" && userInfo.email) {
        intelligentLimiter.handleLoginAttempt(
          userInfo.ip,
          userInfo.email,
          false,
        );
      }
    },
  });
};

/**
 * Helper pour les webhooks de paiement - TRÈS PERMISSIF
 */
export const withPaymentRateLimit = (handler, options = {}) => {
  return withIntelligentRateLimit(handler, {
    ...options,
    category: "payment",
    action: options.action || "webhook",
    extractUserInfo: async (req) => {
      // Extraire l'utilisateur de la session/token
      const user = req.user || {};
      return {
        userId: user._id || user.id,
        email: user.email,
      };
    },
  });
};

/**
 * Helper pour les APIs publiques
 */
export const withApiRateLimit = (handler, options = {}) => {
  return withIntelligentRateLimit(handler, {
    ...options,
    category: "api",
    action: options.action || "publicRead",
  });
};

/**
 * Helper pour le panier - ULTRA PERMISSIF
 */
export const withCartRateLimit = (handler, options = {}) => {
  return withIntelligentRateLimit(handler, {
    ...options,
    category: "cart",
    action: options.action || "update",
    extractUserInfo: async (req) => {
      // Utiliser la session ou un ID de session
      const sessionId =
        req.headers.get("x-session-id") ||
        req.cookies?.get("session_id")?.value;
      return { sessionId };
    },
  });
};

/**
 * Fonction pour débloquer manuellement une IP
 */
export function unblockIP(ip) {
  return intelligentLimiter.blocked.delete(`blocked:${ip}`);
}

/**
 * Fonction pour récupérer les statistiques
 */
export function getRateLimitStats() {
  return intelligentLimiter.getStats();
}

// Export par défaut
export default {
  withIntelligentRateLimit,
  withAuthRateLimit,
  withPaymentRateLimit,
  withApiRateLimit,
  withCartRateLimit,
  unblockIP,
  getRateLimitStats,
  INTELLIGENT_LIMITS,
};
