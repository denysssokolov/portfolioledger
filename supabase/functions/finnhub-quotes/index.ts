import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Get user's Finnhub API key
    const { data: settings, error: settingsError } = await supabase
      .from("swing_settings")
      .select("finhub_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError) {
      console.error("Failed to retrieve swing settings", settingsError);
      return new Response(JSON.stringify({ error: "Failed to retrieve settings" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = settings?.finhub_api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "No Finnhub API key configured. Add it in Swing Trades → Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse tickers from request
    const { tickers } = await req.json();
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return new Response(JSON.stringify({ error: "Provide an array of tickers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch quotes in parallel (limit to 50)
    const uniqueTickers = [...new Set(tickers as string[])].slice(0, 50);
    const quotes: Record<string, { c: number; dp: number; d: number; pc: number } | null> = {};

    await Promise.all(
      uniqueTickers.map(async (ticker) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`
          );
          if (!res.ok) {
            quotes[ticker] = null;
            return;
          }
          const data = await res.json();
          // c = current price, dp = percent change, d = change, pc = previous close
          quotes[ticker] = { c: data.c, dp: data.dp, d: data.d, pc: data.pc };
        } catch {
          quotes[ticker] = null;
        }
      })
    );

    return new Response(JSON.stringify({ quotes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unhandled finnhub-quotes error", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
