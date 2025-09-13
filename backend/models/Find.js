const mongoose = require("mongoose");

const FinderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, default: "" },
  oauthId: { type: String, default: "" },
  provider: { type: String, default: "manual" },
  picture: { type: String, default: "" },
  pickup: { type: String, default: "" },
  drop: { type: String, default: "" },
  pickupLat: { type: Number, default: null },
  pickupLng: { type: Number, default: null },
  dropLat: { type: Number, default: null },
  dropLng: { type: Number, default: null },
  journeyDate: { type: Date },
  carModel: { type: String, default: "" },
  seatsAvailable: { type: Number, default: 0 },
  carNumber: { type: String, default: "" },
  price: { type: Number, default: 0 },
  lastLogin: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("Finder", FinderSchema);
