const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");

const router = express.Router();

// POST /api/auth/create-user
router.post("/create-user", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, city, latitude, longitude } = req.body;

    // All fields required
    if (!firstName || !lastName || !email || !phone || !city || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "All fields including location are required" });
    }

    // Check existing user by email or phone
    let user = await User.findOne({ $or: [{ email }, { phone }] });

    if (!user) {
      // === ID Generation ===
      const initials = `${firstName[0]}${lastName[0]}`.toUpperCase();

      const date = new Date();
      const day = String(date.getDate()).padStart(2, "0"); // e.g. "01"
      const year = date.getFullYear();

      const cityCode = city.substring(0, 3).toUpperCase();

      // Unique part from email + phone
      const uniqueHash = crypto
        .createHash("md5")
        .update(email + phone)
        .digest("hex")
        .substring(0, 8) // 8 chars
        .toUpperCase();

      const userId = `${initials}-${day}-${year}-${cityCode}-${uniqueHash}`;

      // Save new user
      user = new User({
        userId,
        firstName,
        lastName,
        email,
        phone,
        city,
        latitude,
        longitude,
      });

      await user.save();
    }

    res.json({ userId: user.userId, user });
  } catch (err) {
    console.error("Error in create-user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, phone } = req.body;

    // Both fields required
    if (!email || !phone) {
      return res.status(400).json({ error: "Email and phone are required" });
    }

    // Find existing user by email and phone
    const user = await User.findOne({ email, phone });

    if (!user) {
      return res.status(404).json({ error: "User not found. Please register first." });
    }

    res.json({ user, token: "logged-in" });
  } catch (err) {
    console.error("Error in login:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
