#!/usr/bin/env node
/**
 * Oh! Mexico Platform — Daily Data Update Script
 * Run manually: node scripts/update-data.js
 * Automated: GitHub Actions runs this daily at 8 AM EST
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data.json");
const STAGING_FILE = path.join(__dirname, "..", "data-staging.json");

const LOCATIONS = {
  google: {
    "Española Way": process.env.GOOGLE_PLACE_ID_ESPANOLA || "",
    "Ocean Drive": process.env.GOOGLE_PLACE_ID_OCEAN || "",
    "Lincoln Road": process.env.GOOGLE_PLACE_ID_LINCOLN || "",
  },
  yelp: {
    "Española Way": "oh-mexico-espanola-way-miami-beach",
    "Ocean Drive": "oh-mexico-miami-beach-6",
    "Lincoln Road": "oh-mexico-lincoln-road-miami-beach-2",
  },
};

async function fetchGoogleReviews(placeId, apiKey) {
  if (!apiKey || !placeId) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.result) return { rating: data.result.rating, reviews: data.result.user_ratings_total };
  } catch (e) { console.error("Google API error:", e.message); }
  return null;
}

async function fetchYelpReviews(bizId, apiKey) {
  if (!apiKey) return null;
  try {
    const url = `https://api.yelp.com/v3/businesses/${bizId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const data = await res.json();
    if (data.rating) return { rating: data.rating, reviews: data.review_count };
  } catch (e) { console.error("Yelp API error:", e.message); }
  return null;
}

async function updateData() {
  console.log("📊 Oh! Mexico — Daily Data Update");
  console.log("─".repeat(40));

  let currentData;
  try {
    currentData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    console.log("✅ Loaded current data.json");
  } catch (e) {
    console.error("❌ Could not read data.json:", e.message);
    process.exit(1);
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const yelpKey = process.env.YELP_API_KEY;
  let updated = false;

  if (googleKey) {
    console.log("\n🔍 Fetching Google reviews...");
    const gp = currentData.reputation.platforms.find(p => p.name === "Google");
    if (gp) {
      for (const loc of gp.locations) {
        const placeId = LOCATIONS.google[loc.loc];
        const result = await fetchGoogleReviews(placeId, googleKey);
        if (result) {
          const oldRating = loc.rating;
          loc.rating = result.rating;
          loc.newReviews = result.reviews - loc.reviews;
          loc.trend = (result.rating - oldRating >= 0 ? "+" : "") + (result.rating - oldRating).toFixed(1);
          loc.reviews = result.reviews;
          console.log(`  ✅ Google ${loc.loc}: ${result.rating}⭐ (${result.reviews} reviews)`);
          updated = true;
        }
      }
    }
  } else {
    console.log("⚠️  GOOGLE_PLACES_API_KEY not set — skipping Google");
  }

  if (yelpKey) {
    console.log("\n🔍 Fetching Yelp reviews...");
    const yp = currentData.reputation.platforms.find(p => p.name === "Yelp");
    if (yp) {
      for (const loc of yp.locations) {
        const bizId = LOCATIONS.yelp[loc.loc];
        const result = await fetchYelpReviews(bizId, yelpKey);
        if (result) {
          const oldRating = loc.rating;
          loc.rating = result.rating;
          loc.newReviews = result.reviews - loc.reviews;
          loc.trend = (result.rating - oldRating >= 0 ? "+" : "") + (result.rating - oldRating).toFixed(1);
          loc.reviews = result.reviews;
          console.log(`  ✅ Yelp ${loc.loc}: ${result.rating}⭐ (${result.reviews} reviews)`);
          updated = true;
        }
      }
    }
  } else {
    console.log("⚠️  YELP_API_KEY not set — skipping Yelp");
  }

  // Merge staging data (manual updates)
  if (fs.existsSync(STAGING_FILE)) {
    console.log("\n📥 Found data-staging.json — merging manual updates...");
    try {
      const staging = JSON.parse(fs.readFileSync(STAGING_FILE, "utf8"));
      if (staging.reputation) {
        Object.keys(staging.reputation).forEach(key => {
          if (key !== "platforms") currentData.reputation[key] = staging.reputation[key];
        });
      }
      if (staging.intelligence) {
        Object.keys(staging.intelligence).forEach(key => {
          currentData.intelligence[key] = staging.intelligence[key];
        });
      }
      if (staging.locations) currentData.locations = staging.locations;
      fs.unlinkSync(STAGING_FILE);
      console.log("  ✅ Staging data merged and file removed");
      updated = true;
    } catch (e) { console.error("  ❌ Error merging staging data:", e.message); }
  }

  currentData.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(currentData, null, 2));
  console.log(`\n💾 data.json saved (${updated ? "with updates" : "timestamp only"})`);
  console.log(`🕐 Last updated: ${currentData.lastUpdated}`);
}

updateData().catch(e => { console.error("Fatal error:", e); process.exit(1); });
