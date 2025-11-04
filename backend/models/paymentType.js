import mongoose from "mongoose";

const paymentTypeSchema = new mongoose.Schema({
  platform: {
    type: String,
    required: [true, "La plateforme de paiement est requise"],
    enum: {
      values: ["WAAFI", "D-MONEY", "CAC-PAY", "BCI-PAY", "CASH"],
      message: "Type de paiement non supporté: {VALUE}",
    },
  },
  paymentName: {
    type: String,
    required: function () {
      // Nom requis seulement si ce n'est pas CASH
      return this.platform !== "CASH";
    },
  },
  paymentNumber: {
    type: String,
    required: function () {
      // Numéro requis seulement si ce n'est pas CASH
      return this.platform !== "CASH";
    },
  },
  isCashPayment: {
    type: Boolean,
    default: function () {
      return this.platform === "CASH";
    },
  },
  description: {
    type: String,
    default: function () {
      return this.platform === "CASH"
        ? "Paiement en espèces lors de la recuperation"
        : "";
    },
  },
});

export default mongoose.models.PaymentType ||
  mongoose.model("PaymentType", paymentTypeSchema);
