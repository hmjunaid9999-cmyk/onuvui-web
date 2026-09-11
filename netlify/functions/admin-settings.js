const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async function (event, context) {
  connectLambda(event);
  const store = getStore("cricket-cache");

  if (event.httpMethod === "GET") {
    try {
      const settings = (await store.get("settings", { type: "json" })) || {};
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          intervalMinutes: settings.intervalMinutes || 14,
          nextMatchNote: settings.nextMatchNote || "",
        }),
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ intervalMinutes: 14, nextMatchNote: "" }),
      };
    }
  }

  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body || "{}");

    const current = (await store.get("settings", { type: "json" })) || {};
    const updated = { ...current };

    if (body.intervalMinutes !== undefined) {
      updated.intervalMinutes = parseInt(body.intervalMinutes) || 14;
    }
    if (body.nextMatchNote !== undefined) {
      updated.nextMatchNote = body.nextMatchNote;
    }

    await store.setJSON("settings", updated);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, ...updated }),
    };
  }

  return { statusCode: 405, body: "Method not allowed" };
};
