require('dotenv').config();
const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
const mongoose = require("mongoose");
const cors = require("cors");
const User = require("./models/User");
const Finder = require("./models/Find.js");
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
FRONTEND_URL="https://greenwayf.onrender.com";
// ================= MongoDB Connection =================
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));
console.log('Mongo URI:', process.env.MONGO_URI);
// ================= CORS =================
app.use(cors({
  origin: process.env.FRONTEND_URL, 
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// ================= Express Session =================
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// ================= Passport Middleware =================
app.use(passport.initialize());
app.use(passport.session());

// ================= Passport Serialize/Deserialize =================
passport.serializeUser((user, done) => {
  done(null, { id: user.id, model: user instanceof User ? "User" : "Finder" });
});

passport.deserializeUser(async (data, done) => {
  try {
    let user;
    if (data.model === "User") {
      user = await User.findById(data.id);
    } else {
      user = await Finder.findById(data.id);
    }
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ================= Google OAuth Strategies =================
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

// ================= Routes =================
app.get("/auth/google/finder",
  passport.authenticate("google-finder", { scope: ["profile", "email"], prompt: "select_account" })
);

app.get("/auth/google/finder/callback",
  passport.authenticate("google-finder", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/from?email=${encodeURIComponent(req.user.email)}`);
  }
);

app.get("/auth/google/user",
  passport.authenticate("google-user", { scope: ["profile", "email"], prompt: "select_account" })
);

app.get("/auth/google/user/callback",
  passport.authenticate("google-user", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/findR?email=${encodeURIComponent(req.user.email)}`);
  }
);

console.log('GOOGLE_FINDER_CLIENT_ID:', process.env.GOOGLE_FINDER_CLIENT_ID);
console.log('GOOGLE_FINDER_CLIENT_SECRET:', process.env.GOOGLE_FINDER_CLIENT_SECRET);
console.log('CALLBACK URL:', `${process.env.BACKEND_URL}/auth/google/finder/callback`);
console.log("GOOGLE_USER_CLIENT_ID:", process.env.GOOGLE_USER_CLIENT_ID);
console.log("GOOGLE_USER_CLIENT_SECRET:", process.env.GOOGLE_USER_CLIENT_SECRET);
console.log("CALLBACK URL:", `${process.env.BACKEND_URL}/auth/google/user/callback`);

app.get("/auth/user", (req, res) => res.json(req.user || null));

app.get("/me", (req, res) => {
  if (req.user) res.json({ email: req.user.email });
  else res.status(401).json({ error: "Not logged in" });
});

app.post("/update", async (req, res) => {
  const { email, pickup, drop } = req.body;
  try {
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { pickup, drop, date: Date.now() } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.post("/update1", async (req, res) => {
  const { email, pickup, drop, journeyDate, carModel, seatsAvailable, carNumber, Cost } = req.body;
  try {
    const finder = await Finder.findOneAndUpdate(
      { email },
      { $set: { pickup, drop, journeyDate, carModel, seatsAvailable, carNumber, lastLogin: Date.now(), price: Cost } },
      { new: true }
    );
    if (!finder) return res.status(404).json({ error: "User not found" });
    res.json(finder);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect("/");
    });
  });
});

app.post("/userSignup", async (req, res) => {
  const { userName, email, password } = req.body;
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ name: userName, email, password: hashed, oauthId: "", provider: "manual" });
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

    res.redirect(`${process.env.FRONTEND_URL}/findR?email=${encodeURIComponent(req.user.email)}`);
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/userSignup", async (req, res) => {
  const users = await User.find();
  res.status(200).json(users);
});

app.post("/finderSignup", async (req, res) => {
  const { userName, email, password } = req.body;
  try {
    const exists = await Finder.findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newfinder = new Finder({ name: userName, email, password: hashed, oauthId: "", provider: "manual" });
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

const geocode = async (place) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`);
    const data = await res.json();
    console.log(data);
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    return null;
  } catch (err) {
    return null;
  }
};

app.post("/nearby-riders", async (req, res) => {
  const { userLocation, userDropLocation, radius } = req.body;
  try {
    const allFinders = await Finder.find({ pickup: { $exists: true, $ne: "" }, drop: { $exists: true, $ne: "" } });

    const nearbyRiders = [];

    for (let finder of allFinders) {
      const pickupCoords = await geocode(finder.pickup);
      const dropCoords = await geocode(finder.drop);

      if (!pickupCoords) console.log(`⚠️ Geocoding failed for pickup: "${finder.pickup}"`);
      if (!dropCoords) console.log(`⚠️ Geocoding failed for drop: "${finder.drop}"`);

      // Only calculate distances if both coordinates exist
      if (pickupCoords && dropCoords) {
        const pickupDistance = haversineDistance(
          { lat: userLocation.lat, lng: userLocation.lng },
          { lat: pickupCoords[0], lng: pickupCoords[1] }
        );
        const dropDistance = haversineDistance(
          { lat: userDropLocation.lat, lng: userDropLocation.lng },
          { lat: dropCoords[0], lng: dropCoords[1] }
        );

        if (pickupDistance <= radius && dropDistance <= radius) {
          nearbyRiders.push({
            id: finder._id,
            name: finder.name,
            picture: finder.picture,
            pickupLat: pickupCoords[0],
            pickupLng: pickupCoords[1],
            dropLat: dropCoords[0],
            dropLng: dropCoords[1],
            pickup: finder.pickup,
            drop: finder.drop,
            carModel: finder.carModel,
            seats: finder.seatsAvailable,
            carnumber: finder.carNumber,
            price: finder.price,
            email: finder.email,
          });
        }
      } else {
        // Optional: still return rider but mark as unlocatable
        nearbyRiders.push({
          id: finder._id,
          name: finder.name,
          picture: finder.picture,
          pickupLat: pickupCoords ? pickupCoords[0] : null,
          pickupLng: pickupCoords ? pickupCoords[1] : null,
          dropLat: dropCoords ? dropCoords[0] : null,
          dropLng: dropCoords ? dropCoords[1] : null,
          pickup: finder.pickup,
          drop: finder.drop,
          carModel: finder.carModel,
          seats: finder.seatsAvailable,
          carnumber: finder.carNumber,
          price: finder.price,
          email: finder.email,
          geocodeFailed: true,
        });
      }
    }

    res.json(nearbyRiders);
  } catch (err) {
    console.log("❌ Error in /nearby-riders:", err);
    res.status(500).json({ message: "Failed to get nearby riders" });
  }
});

app.get("/user", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const finder = await Finder.findOne({ email });
  if (!finder) return res.status(404).json({ message: "User not found" });

  res.json(finder);
});

app.post("/booking", async (req, res) => {
  const { userEmail, riderEmail, pickup, drop, journeyDate } = req.body;

  try {
    const user = await User.findOne({ email: userEmail });
    const rider = await Finder.findOne({ email: riderEmail });

    if (!user || !rider) return res.status(404).json({ message: "User or Rider not found" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: "🚗 Ride Booking Confirmation",
      html: `<h3>Your session has been booked successfully!</h3> <p><strong>Pickup:</strong> ${pickup}</p> <p><strong>Drop:</strong> ${drop}</p> <p><strong>Journey Date:</strong> ${journeyDate}</p> <h4>Rider Details:</h4> <p><strong>Name:</strong> ${rider.name}</p> <p><strong>Email:</strong> ${rider.email}</p> <p><strong>Car Model:</strong> ${rider.carModel}</p> <p><strong>Car Number:</strong> ${rider.carNumber}</p> <p><strong>Seats Available:</strong> ${rider.seatsAvailable}</p>`, // your email HTML content
    };

    const riderMailOptions = {
      from: process.env.EMAIL_USER,
      to: riderEmail,
      subject: "📢 Ride Booked",
      html: `<h3>Your ride has been booked by a user!</h3> <p><strong>Pickup:</strong> ${pickup}</p> <p><strong>Drop:</strong> ${drop}</p> <p><strong>Journey Date:</strong> ${journeyDate}</p> <h4>User Details:</h4> <p><strong>Name:</strong> ${user.name}</p> <p><strong>Email:</strong> ${user.email}</p>`, // your email HTML content    
      };

    await transporter.sendMail(mailOptions);
    await transporter.sendMail(riderMailOptions);

    res.json({ message: "Booking confirmed and email sent!" });
  } catch {
    res.status(500).json({ message: "Booking failed" });
  }
});

app.listen(process.env.PORT || 5000, () => console.log("🚀 Server running"));
