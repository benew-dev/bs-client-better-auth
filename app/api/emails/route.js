import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { Resend } from "resend";
import dbConnect from "@/backend/config/dbConnect";
import { validateContactMessage } from "@/helpers/validation/schemas/contact";
import { captureException } from "@/monitoring/sentry";
import { withIntelligentRateLimit } from "@/utils/rateLimit";
import DOMPurify from "isomorphic-dompurify";
import { isAuthenticatedUser } from "@/lib/auth-utils";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/emails
 * Envoie un email de contact
 * Rate limit: Configuration intelligente personnalisée (3 emails par 15 minutes, strict)
 *
 * Headers de sécurité gérés par next.config.mjs pour /api/emails/* :
 * - Cache-Control: private, no-cache, no-store, must-revalidate
 * - Pragma: no-cache
 * - X-Content-Type-Options: nosniff
 * - X-Robots-Tag: noindex, nofollow
 * - X-Download-Options: noopen
 *
 * Headers globaux de sécurité (toutes routes) :
 * - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
 * - X-Frame-Options: SAMEORIGIN
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: [configuration restrictive]
 * - Content-Security-Policy: [configuration complète]
 */
export const POST = withIntelligentRateLimit(
  async function (req) {
    try {
      // Vérifier l'authentification
      const user = await isAuthenticatedUser();

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: "User not found",
            code: "USER_NOT_FOUND",
          },
          { status: 404 },
        );
      }

      // Vérifier si le compte est actif
      if (!user.isActive) {
        return NextResponse.json(
          {
            success: false,
            message: "Account suspended. Cannot send messages",
            code: "ACCOUNT_SUSPENDED",
          },
          { status: 403 },
        );
      }

      // Connexion DB
      await dbConnect();

      // Parser et valider les données
      let body;
      try {
        body = await req.json();
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid request body",
            code: "INVALID_BODY",
          },
          { status: 400 },
        );
      }

      const { subject, message } = body;

      // Validation avec Yup
      const validation = await validateContactMessage({ subject, message });

      if (!validation.isValid) {
        return NextResponse.json(
          {
            success: false,
            message: "Validation failed",
            code: "VALIDATION_FAILED",
            errors: validation.errors,
          },
          { status: 400 },
        );
      }

      // Sanitizer le contenu pour éviter les injections XSS dans l'email
      const sanitizedSubject = DOMPurify.sanitize(validation.data.subject, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      });

      const sanitizedMessage = DOMPurify.sanitize(validation.data.message, {
        ALLOWED_TAGS: ["b", "i", "em", "strong", "p", "br"],
        ALLOWED_ATTR: [],
      });

      // Vérifier la configuration Resend
      if (!process.env.RESEND_API_KEY) {
        console.error("RESEND_API_KEY not configured");
        captureException(new Error("Email service not configured"), {
          tags: { component: "api", route: "emails/POST" },
          level: "error",
        });

        return NextResponse.json(
          {
            success: false,
            message: "Email service temporarily unavailable",
            code: "SERVICE_UNAVAILABLE",
          },
          { status: 503 },
        );
      }

      // Options de l'email pour Resend avec template amélioré
      const emailOptions = {
        from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
        reply_to: user.email,
        to: process.env.CONTACT_EMAIL || ["fathismael@gmail.com"],
        subject: `[Contact BuyItNow] ${sanitizedSubject}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Nouveau Message de Contact</h1>
              </div>
              
              <div style="padding: 30px;">
                <div style="background-color: #f8f9fa; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px;">
                  <p style="margin: 0 0 10px 0; color: #666;"><strong>De:</strong> ${user.name}</p>
                  <p style="margin: 0 0 10px 0; color: #666;"><strong>Email:</strong> ${user.email}</p>
                  ${user.phone ? `<p style="margin: 0 0 10px 0; color: #666;"><strong>Téléphone:</strong> ${user.phone}</p>` : ""}
                  <p style="margin: 0; color: #666;"><strong>Sujet:</strong> ${sanitizedSubject}</p>
                </div>
                
                <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 4px;">
                  <h3 style="color: #1f2937; margin-top: 0;">Message:</h3>
                  <div style="color: #4b5563; line-height: 1.6; white-space: pre-wrap;">${sanitizedMessage}</div>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                
                <div style="text-align: center; color: #9ca3af; font-size: 12px;">
                  <p>Message envoyé depuis BuyItNow - ${new Date().toLocaleString("fr-FR")}</p>
                  <p>ID Utilisateur: ${user.id}</p>
                  <p>Compte ${user.emailVerified ? "Vérifié ✓" : "Non vérifié"}</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
De: ${user.name}
Email: ${user.email}
${user.phone ? `Téléphone: ${user.phone}` : ""}
Sujet: ${sanitizedSubject}

Message:
${sanitizedMessage}

---
Message envoyé depuis BuyItNow
Date: ${new Date().toLocaleString("fr-FR")}
ID Utilisateur: ${user.id}
`,
      };

      // Envoyer l'email avec gestion d'erreur
      let emailResult;
      try {
        emailResult = await resend.emails.send(emailOptions);

        if (!emailResult || emailResult.error) {
          throw new Error(emailResult?.error?.message || "Email send failed");
        }
      } catch (emailError) {
        console.error("Resend API error:", emailError);

        captureException(emailError, {
          tags: {
            component: "api",
            route: "emails/POST",
            service: "resend",
          },
          user: { id: user.id, email: user.email },
          extra: {
            subject: sanitizedSubject,
            messageLength: sanitizedMessage.length,
          },
        });

        return NextResponse.json(
          {
            success: false,
            message: "Failed to send email. Please try again later",
            code: "EMAIL_SEND_FAILED",
          },
          { status: 500 },
        );
      }

      // Log de sécurité pour audit
      console.log("🔒 Security event - Contact email sent:", {
        userId: user.id,
        userEmail: user.email,
        subject: sanitizedSubject.substring(0, 50),
        messageLength: sanitizedMessage.length,
        emailId: emailResult.id,
        timestamp: new Date().toISOString(),
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      });

      // Succès
      return NextResponse.json(
        {
          success: true,
          message: "Email sent successfully",
          data: {
            emailId: emailResult.id,
            subject: sanitizedSubject,
            timestamp: new Date().toISOString(),
            meta: {
              provider: "resend",
              recipientCount: Array.isArray(emailOptions.to)
                ? emailOptions.to.length
                : 1,
            },
          },
        },
        { status: 201 },
      );
    } catch (error) {
      console.error("Email send error:", error.message);

      // Capturer seulement les vraies erreurs système
      if (!error.message?.includes("authentication")) {
        captureException(error, {
          tags: {
            component: "api",
            route: "emails/POST",
            user: req.user?.email,
          },
          level: "error",
        });
      }

      // Gestion améliorée des erreurs
      let status = 500;
      let message = "Failed to send email";
      let code = "INTERNAL_ERROR";

      if (error.message?.includes("authentication")) {
        status = 401;
        message = "Authentication failed";
        code = "AUTH_FAILED";
      } else if (error.name === "ValidationError") {
        status = 400;
        message = "Invalid data";
        code = "VALIDATION_ERROR";
      } else if (error.message?.includes("rate limit")) {
        status = 429;
        message = "Too many requests";
        code = "RATE_LIMITED";
      } else if (error.message?.includes("connection")) {
        status = 503;
        message = "Service temporarily unavailable";
        code = "SERVICE_UNAVAILABLE";
      }

      return NextResponse.json(
        {
          success: false,
          message,
          code,
          ...(process.env.NODE_ENV === "development" && {
            error: error.message,
          }),
        },
        { status },
      );
    }
  },
  {
    category: "api",
    action: "write",
    customStrategy: {
      points: 3,
      duration: 900000,
      blockDuration: 1800000,
      keyStrategy: "user",
      requireAuth: true,
    },
    extractUserInfo: async (req) => {
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

        return {
          userId: token?.user?._id || token?.user?.id || token?.sub,
          email: token?.user?.email,
        };
      } catch (error) {
        console.error(
          "[EMAILS] Error extracting user from JWT:",
          error.message,
        );
        return {};
      }
    },
  },
);
