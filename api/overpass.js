/**
 * Serverless proxy for Overpass (overpass-api.de).
 * That service returns HTTP 406 unless requests identify themselves with a
 * non-stock User-Agent (browser fetch cannot set User-Agent). Keep in sync
 * with Frontend/api/overpass.js if both exist.
 */
const OVERPASS_UPSTREAM = "https://overpass-api.de/api/interpreter";
const UA =
  "YourTourGuide/2 (+https://github.com/duliptharaka/Tourism_Map_Info_Search; overpass-proxy)";

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).send("Method Not Allowed");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");

  const upstream = await fetch(OVERPASS_UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": req.headers["content-type"] || "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": UA,
    },
    body,
  });

  const text = await upstream.text();
  const ct = upstream.headers.get("content-type") || "application/json";
  res.status(upstream.status).setHeader("Content-Type", ct);
  return res.send(text);
}

handler.config = {
  api: { bodyParser: false },
};

module.exports = handler;
