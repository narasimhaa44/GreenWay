require('dotenv').config();
const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

const User = require("./models/User");
const Finder = require("./models/Find");

const app = express();
app.use(express.json());

const FRONTEND_URL = process.env.FRONTEND_URL || "https://greenwayf.onrender.com";

// ================= MongoDB =================
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// ================= CORS =================
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// ================= Sessions =================
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// ================= Passport =================
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, { id: user.id, model: user instanceof User ? "User" : "Finder" });
});

passport.deserializeUser(async (data, done) => {
  try {
    const user = data.model === "User" 
      ? await User.findById(data.id) 
      : await Finder.findById(data.id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ================= Google OAuth =================
passport.use("google-finder", new GoogleStrategy({
    clientID: process.env.GOOGLE_FINDER_CLIENT_ID,
    clientSecret: process.env.GOOGLE_FINDER_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/auth/google/finder/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let finder = await Finder.findOne({ email: profile.emails[0].value });
      if (!finder) {
        finder = await Finder.create({
          oauthId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          picture: profile.photos[0].value,
          provider: "google-finder",
        });
      }
      return done(null, finder);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.use("google-user", new GoogleStrategy({
    clientID: process.env.GOOGLE_USER_CLIENT_ID,
    clientSecret: process.env.GOOGLE_USER_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/auth/google/user/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ email: profile.emails[0].value });
      if (!user) {
        user = await User.create({
          oauthId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          picture: profile.photos[0].value,
          provider: "google-user",
        });
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

// ================= Helper Functions =================
const haversineDistance = (coord1, coord2) => {
  const toRad = (val) => (val * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
            Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const geocodePlace = async (place) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`);
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch (err) {
    console.error("❌ Geocoding error:", err);
    return null;
  }
};

// ================= Routes =================

// User & Finder signup/login
app.post("/userSignup", async (req, res) => {
  const { userName, email, password } = req.body;
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });
    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ name: userName, email, password: hashed });
    await newUser.save();
    res.json({ message: "Signup successful" });
  } catch {
    res.status(500).json({ message: "Signup Failed" });
  }
});

app.post("/userlogin", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid Credentials" });
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ email: user.email, token });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

app.post("/finderSignup", async (req, res) => {
  const { userName, email, password } = req.body;
  try {
    const exists = await Finder.findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });
    const hashed = await bcrypt.hash(password, 10);
    const newfinder = new Finder({ name: userName, email, password: hashed });
    await newfinder.save();
    res.json({ message: "Signup successful" });
  } catch (err) {
    res.status(500).json({ message: "Signup Failed" });
  }
});

app.post("/finderlogin", async (req, res) => {
  const { email, password } = req.body;
  try {
    const finder = await Finder.findOne({ email });
    if (!finder) return res.status(400).json({ message: "Invalid credentials" });
    const isMatch = await bcrypt.compare(password, finder.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid Credentials" });
    const token = jwt.sign({ id: finder._id, email: finder.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ email: finder.email, token });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

// Update Finder route with coordinates
app.post("/update1", async (req, res) => {
  const { email, pickup, drop, journeyDate, carModel, seatsAvailable, carNumber, Cost } = req.body;
  try {
    const pickupCoords = await geocodePlace(pickup);
    const dropCoords = await geocodePlace(drop);

    const finder = await Finder.findOneAndUpdate(
      { email },
      { 
        $set: { 
          pickup,
          drop,
          pickupLat: pickupCoords?.lat || null,
          pickupLng: pickupCoords?.lng || null,
          dropLat: dropCoords?.lat || null,
          dropLng: dropCoords?.lng || null,
          journeyDate,
          carModel,
          seatsAvailable,
          carNumber,
          lastLogin: Date.now(),
          price: Cost 
        } 
      },
      { new: true }
    );

    if (!finder) return res.status(404).json({ error: "User not found" });
    res.json(finder);
  } catch (err) {
    console.error("❌ Update1 error:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Nearby riders route
app.post("/nearby-riders", async (req, res) => {
  const { userLocation, userDropLocation, radius } = req.body;
  try {
    const allFinders = await Finder.find({ pickupLat: { $exists: true, $ne: null }, dropLat: { $exists: true, $ne: null } });

    const nearbyRiders = allFinders.filter(finder => {
      const pickupDistance = haversineDistance(userLocation, { lat: finder.pickupLat, lng: finder.pickupLng });
      const dropDistance = haversineDistance(userDropLocation, { lat: finder.dropLat, lng: finder.dropLng });
      return pickupDistance <= radius && dropDistance <= radius;
    }).map(finder => ({
      id: finder._id,
      name: finder.name,
      picture: finder.picture,
      pickupLat: finder.pickupLat,
      pickupLng: finder.pickupLng,
      dropLat: finder.dropLat,
      dropLng: finder.dropLng,
      pickup: finder.pickup,
      drop: finder.drop,
      carModel: finder.carModel,
      seats: finder.seatsAvailable,
      carnumber: finder.carNumber,
      price: finder.price,
      email: finder.email,
    }));

    res.json(nearbyRiders);
  } catch (err) {
    console.error("❌ Nearby riders error:", err);
    res.status(500).json({ message: "Failed to get nearby riders" });
  }
});

// ================= Start Server =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

