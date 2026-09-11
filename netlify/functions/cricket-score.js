const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async function (event, context) {
  connectLambda(event);

  const API_KEY = "12d050ed16msh61dc65f1973a147p14a56ejsn1c6ec5d92379";
  const API_HOST = "cricket-highlights-api.p.rapidapi.com";
  const store = getStore("cricket-cache");

  let intervalMinutes = 14;
  try {
    const settings = await store.get("settings", { type: "json" });
    if (settings && settings.intervalMinutes) {
      intervalMinutes = settings.intervalMinutes;
    }
  } catch (e) {}

  try {
    const cached = await store.get("scores", { type: "json" });
    const now = Date.now();
    if (cached && cached.timestamp && now - cached.timestamp < intervalMinutes * 60 * 1000) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(cached.data),
      };
    }
  } catch (e) {}

  try {
    // আজকে এবং গতকাল - দুই দিনের ম্যাচ আনা হচ্ছে
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const todayStr = today.toISOString().split("T")[0];
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const [todayRes, yesterdayRes] = await Promise.all([
      fetch(`https://${API_HOST}/matches?date=${todayStr}&limit=20`, {
        headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": API_HOST },
      }),
      fetch(`https://${API_HOST}/matches?date=${yesterdayStr}&limit=20`, {
        headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": API_HOST },
      }),
    ]);

    const todayData = await todayRes.json();
    const yesterdayData = await yesterdayRes.json();

    const combined = [...(todayData.data || []), ...(yesterdayData.data || [])];

    await store.setJSON("scores", { data: combined, timestamp: Date.now() });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ data: combined }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "স্কোর আনতে সমস্যা হয়েছে" }),
    };
  }
};
