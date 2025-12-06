export default {
    async fetch(request, env) {
        // 1. Handle CORS (Allow your GitHub page to talk to this worker)
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*", // Change "*" to "https://yourname.github.io" for better security later
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        // Handle the browser's "Preflight" check
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // 2. Prepare the Unsplash API request
        // We grab the search params (w, h, collections, etc) from the incoming request
        const url = new URL(request.url);
        const params = url.searchParams.toString();
        const unsplashUrl = `https://api.unsplash.com/photos/random?${params}`;

        try {
            // 3. Call Unsplash (Injecting the Key securely)
            const unsplashResponse = await fetch(unsplashUrl, {
                headers: {
                    "Authorization": `Client-ID ${env.UNSPLASH_API_KEY}`, // Using the Environment Variable
                    "Accept-Version": "v1"
                }
            });

            // 4. Return the result to your frontend
            const data = await unsplashResponse.text();
            return new Response(data, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                },
                status: unsplashResponse.status
            });

        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: corsHeaders
            });
        }
    }
};