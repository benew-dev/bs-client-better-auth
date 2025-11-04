import mongoose from "mongoose";
import logger from "@/utils/logger";
import { captureException } from "@/monitoring/sentry";

/**
 * Schéma détaillé pour les produits dans une commande
 * Stocke toutes les informations nécessaires pour référence historique
 */
const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, "ID du produit obligatoire"],
    ref: "Product",
    index: true,
    default: null,
  },
  name: {
    type: String,
    required: [true, "Nom du produit obligatoire"],
    trim: true,
    maxlength: [100, "Le nom ne peut pas dépasser 100 caractères"],
  },
  category: {
    type: String,
    required: [true, "Catégorie obligatoire"],
    trim: true,
  },
  quantity: {
    type: Number,
    required: [true, "Quantité obligatoire"],
    min: [1, "La quantité minimum est 1"],
    validate: {
      validator: Number.isInteger,
      message: "La quantité doit être un nombre entier",
    },
  },
  image: {
    type: String,
    required: [true, "Image obligatoire"],
  },
  price: {
    type: Number,
    required: [true, "Prix unitaire obligatoire"],
    min: [0, "Le prix ne peut pas être négatif"],
    set: (val) => Math.round(val * 100) / 100,
  },
  subtotal: {
    type: Number,
    required: true,
    min: [0, "Le sous-total ne peut pas être négatif"],
    set: (val) => Math.round(val * 100) / 100,
  },
});

/**
 * Schéma de paiement avec validation stricte
 */
const paymentInfoSchema = new mongoose.Schema({
  typePayment: {
    type: String,
    required: [true, "Type de paiement obligatoire"],
    enum: {
      values: ["WAAFI", "D-MONEY", "CAC-PAY", "BCI-PAY", "CASH"],
      message: "Type de paiement non supporté: {VALUE}",
    },
  },
  paymentAccountNumber: {
    type: String,
    required: function () {
      return this.typePayment !== "CASH";
    },
    trim: true,
    maxlength: [50, "Le numéro ne peut pas dépasser 50 caractères"],
    default: function () {
      return this.typePayment === "CASH" ? "CASH" : undefined;
    },
    get: function (val) {
      if (!val || val === "CASH") return val;
      return val.length > 4 ? "••••••" + val.slice(-4) : val;
    },
  },
  paymentAccountName: {
    type: String,
    required: function () {
      return this.typePayment !== "CASH";
    },
    trim: true,
    maxlength: [100, "Le nom ne peut pas dépasser 100 caractères"],
    default: function () {
      return this.typePayment === "CASH" ? "Paiement en espèces" : undefined;
    },
  },
  paymentDate: {
    type: Date,
    default: Date.now,
  },
  isCashPayment: {
    type: Boolean,
    default: function () {
      return this.typePayment === "CASH";
    },
  },
  cashPaymentNote: {
    type: String,
    default: function () {
      return this.typePayment === "CASH"
        ? "Le paiement sera effectué en espèces à la livraison"
        : "";
    },
  },
});

/**
 * Schéma de commande complet avec validation, indexation et relations
 */
const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    orderItems: [orderItemSchema],
    paymentInfo: paymentInfoSchema,
    paymentStatus: {
      type: String,
      enum: {
        values: [
          "unpaid",
          "processing",
          "paid",
          "refunded",
          "failed",
          "pending_cash",
        ],
        message: "Statut de paiement non valide: {VALUE}",
      },
      default: function () {
        // Si c'est un paiement CASH, statut par défaut est pending_cash
        return this.paymentInfo?.typePayment === "CASH"
          ? "pending_cash"
          : "unpaid";
      },
      index: true,
    },
    totalAmount: {
      type: Number,
      min: [0, "Le montant total ne peut pas être négatif"],
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: [200, "La raison ne peut pas dépasser 200 caractères"],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    paidAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
  },
  {
    timestamps: {
      updatedAt: "updatedAt",
      createdAt: false,
    },
    toJSON: {
      virtuals: true,
      getters: true,
      transform: function (doc, ret) {
        delete ret.__v;
        if (ret.paymentInfo && ret.paymentInfo.paymentAccountNumber) {
          const num = ret.paymentInfo.paymentAccountNumber;
          if (num !== "CASH") {
            ret.paymentInfo.paymentAccountNumber =
              num.length > 4 ? "••••••" + num.slice(-4) : num;
          }
        }
        return ret;
      },
    },
    toObject: { virtuals: true, getters: true },
  },
);

// Indexer pour les requêtes fréquentes
// orderSchema.index({ "user.userId": 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

// Créer un identifiant unique au format ORD-YYYYMMDD-XXXXX
orderSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const date = new Date();
      const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");

      const lastOrder = await this.constructor
        .findOne(
          {
            orderNumber: new RegExp(`ORD-${datePart}-\\d+`),
          },
          { orderNumber: 1 },
        )
        .sort({ orderNumber: -1 });

      let sequence = 1;
      if (lastOrder && lastOrder.orderNumber) {
        const lastSequence = parseInt(
          lastOrder.orderNumber.split("-")[2] || "0",
        );
        sequence = lastSequence + 1;
      }

      this.orderNumber = `ORD-${datePart}-${sequence.toString().padStart(5, "0")}`;
    } catch (error) {
      logger.error("Erreur lors de la génération du numéro de commande", {
        error: error.message,
        userId: this.user?.userId,
      });

      const timestamp = Date.now().toString();
      this.orderNumber = `ORD-${timestamp.substring(0, 8)}-${timestamp.substring(8)}`;
    }

    if (this.orderItems && this.orderItems.length > 0) {
      this.orderItems.forEach((item) => {
        if (!item.subtotal) {
          item.subtotal = item.price * item.quantity;
        }
      });
    }

    // Définir le statut de paiement initial pour CASH
    if (this.paymentInfo?.typePayment === "CASH" && !this.paymentStatus) {
      this.paymentStatus = "pending_cash";
    }
  }

  this.updatedAt = Date.now();
  next();
});

// Vérifier la cohérence des données avant sauvegarde
orderSchema.pre("save", function (next) {
  if (this.isModified("orderItems") || this.isNew) {
    const itemsTotal = this.orderItems.reduce(
      (sum, item) => sum + (item.subtotal || item.price * item.quantity),
      0,
    );
    this.totalAmount = itemsTotal;
  }

  if (
    this.isModified("paymentStatus") &&
    this.paymentStatus === "paid" &&
    !this.paidAt
  ) {
    this.paidAt = Date.now();
  }

  next();
});

// Mettre à jour le stock après création d'une commande
orderSchema.post("save", async function () {
  try {
    if (this.isNew) {
      const Product = mongoose.model("Product");
      const bulkOps = this.orderItems.map((item) => ({
        updateOne: {
          filter: { _id: item.product },
          update: {
            $inc: {
              stock: -item.quantity,
              sold: item.quantity,
            },
          },
        },
      }));

      if (bulkOps.length > 0) {
        await Product.bulkWrite(bulkOps);
      }
    }
  } catch (error) {
    logger.error("Erreur lors de la mise à jour du stock", {
      error: error.message,
      orderId: this._id,
      orderNumber: this.orderNumber,
    });

    captureException(error, {
      tags: { component: "order-model", operation: "update-stock" },
    });
  }
});

// Méthode pour calculer le total de la commande
orderSchema.methods.calculateTotal = function () {
  return this.orderItems.reduce(
    (sum, item) => sum + (item.subtotal || item.price * item.quantity),
    0,
  );
};

// Méthode pour vérifier si c'est un paiement en espèces
orderSchema.methods.isCashPayment = function () {
  return (
    this.paymentInfo?.typePayment === "CASH" ||
    this.paymentInfo?.isCashPayment === true
  );
};

// Méthode statique pour trouver les commandes d'un utilisateur
// orderSchema.statics.findByUser = function (userId, limit = 10, page = 1) {
//   const skip = (page - 1) * limit;
//   return this.find({ "user.userId": userId })
//     .select("-__v")
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(limit)
//     .lean();
// };

// Méthode statique pour trouver les commandes récentes
orderSchema.statics.findRecent = function (limit = 20) {
  return this.find().sort({ createdAt: -1 }).limit(limit).lean();
};

// Méthode statique pour les statistiques de commandes
orderSchema.statics.getStats = async function () {
  try {
    const stats = await this.aggregate([
      {
        $facet: {
          payment: [{ $group: { _id: "$paymentStatus", count: { $sum: 1 } } }],
          revenue: [
            { $match: { paymentStatus: "paid" } },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ],
          daily: [
            {
              $match: {
                createdAt: {
                  $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                orders: { $sum: 1 },
                revenue: {
                  $sum: {
                    $cond: [
                      { $eq: ["$paymentStatus", "paid"] },
                      "$totalAmount",
                      0,
                    ],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
          ],
          cashOrders: [
            { $match: { "paymentInfo.typePayment": "CASH" } },
            {
              $group: {
                _id: "$paymentStatus",
                count: { $sum: 1 },
                total: { $sum: "$totalAmount" },
              },
            },
          ],
        },
      },
    ]);

    return stats[0];
  } catch (error) {
    logger.error("Erreur lors du calcul des statistiques de commandes", {
      error: error.message,
    });
    throw error;
  }
};

// Méthode statique pour calculer le montant total des commandes d'un utilisateur
orderSchema.statics.getTotalAmountByUser = async function (
  userId,
  onlyPaid = false,
) {
  const matchStage = { "user.userId": new mongoose.Types.ObjectId(userId) };
  if (onlyPaid) {
    matchStage.paymentStatus = "paid";
  }

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$totalAmount" },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  return result.length > 0
    ? { totalAmount: result[0].totalAmount, orderCount: result[0].orderCount }
    : { totalAmount: 0, orderCount: 0 };
};

// Protection contre les recherches trop intensives
orderSchema.pre("find", function () {
  if (!this.options.limit) {
    this.limit(100);
  }

  this.maxTimeMS(5000);
});

// Virtualiser le nombre d'articles
orderSchema.virtual("itemCount").get(function () {
  return this.orderItems.reduce((total, item) => total + item.quantity, 0);
});

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
