import { facebookConfigured, initFromUserToken } from "./lib/facebook.mjs";

export default async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  if (!facebookConfigured()) {
    return new Response(JSON.stringify({ error: "FB_APP_ID / FB_APP_SECRET not set in Netlify env vars" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const userToken = process.env.FB_USER_TOKEN || url.searchParams.get("token");
  if (!userToken) {
    return new Response(JSON.stringify({ error: "Provide the short-lived user token via FB_USER_TOKEN env var or ?token=" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    const result = await initFromUserToken(userToken);
    return new Response(JSON.stringify({ success: true, connected: result }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/facebook-init" };
