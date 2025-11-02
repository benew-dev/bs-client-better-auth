const config = {
  plugins: {
    // Plugin Tailwind CSS v4 - OBLIGATOIRE
    "@tailwindcss/postcss": {
      // IMPORTANT : Désactiver l'optimisation intégrée pour éviter la double minification
      optimize: false,
      minify: false,
    },

    // Minification CSS pour production avec cssnano
    ...(process.env.NODE_ENV === "production" && {
      cssnano: {
        preset: [
          "default",
          {
            discardComments: {
              removeAll: true,
            },
            minifyFontValues: true,
            minifyGradients: true,
            mergeLonghand: true,
            colormin: true,
            zindex: false, // ✅ Bon : évite les problèmes
            reduceIdents: false, // ✅ Bon : évite les problèmes avec animations
          },
        ],
      },
    }),
  },
};

export default config;
