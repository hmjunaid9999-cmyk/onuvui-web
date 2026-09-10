exports.handler = async function (event, context) {
  const API_KEY = "12d050ed16msh61dc65f1973a147p14a56ejsn1c6ec5d92379";
  const API_HOST = "cricket-highlights-api.p.rapidapi.com";

  try {
    const response = await fetch(
      `https://${API_HOST}/matches?limit=20`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": API_KEY,
          "x-rapidapi-host": API_HOST,
        },
      }
    );

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "স্কোর আনতে সমস্যা হয়েছে" }),
    };
  }
};
