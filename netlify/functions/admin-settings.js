const { getStore, connectLambda } = require("@netlify/blobs");

// এই পাসওয়ার্ডটা পরিবর্তন করে নিজের একটা গোপন পাসওয়ার্ড বসাও
const ADMIN_PASSWORD = "onuvuti2026";

exports.handler = async function (event, context) {
  connectLambda(event);
  const store = getStore("cricket-cache");

  if (event.httpMethod === "GET") {
    try {
      const settings = (await store.get("settings", { type: "json" })) || { intervalMinutes: 14 };
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(settings),
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ intervalMinutes: 14 }),
      };
    }
  }

  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body || "{}");

    if (body.password !== ADMIN_PASSWORD) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "ভুল পাসওয়ার্ড" }),
      };
    }

    const intervalMinutes = parseInt(body.intervalMinutes) || 14;
    await store.setJSON("settings", { intervalMinutes });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, intervalMinutes }),
    };
  }

  return { statusCode: 405, body: "Method not allowed" };
};
