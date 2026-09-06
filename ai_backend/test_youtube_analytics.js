const fs = require("fs");
const { google } = require("googleapis");

async function testAnalytics() {
  const credentials = JSON.parse(fs.readFileSync("./credentials.json"));
  const token = JSON.parse(fs.readFileSync("./token.json"));

  const config = credentials.installed || credentials.web;

  const auth = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    config.redirect_uris[0]
  );

  auth.setCredentials(token);

  const analytics = google.youtubeAnalytics({
    version: "v2",
    auth,
  });

  try {
    const res = await analytics.reports.query({
      ids: "channel==MINE",
      startDate: "2026-08-01",
      endDate: "2026-08-24",
      metrics: "views",
      dimensions: "day",
    });

    console.log("\n✅ SUCCESS!");
    console.log("YouTube Analytics permission working.");
    console.log(res.data.rows?.slice(0, 5));
  } catch (err) {
    console.error("\n❌ FAILED");
    console.error(err.response?.data || err.message);
  }
}

testAnalytics();