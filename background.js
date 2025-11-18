// --- Global variables for final colors ---
let finalTintColor = [180, 0.5, 0.15]; // Default Teal fallback HSL [h, s, l]
let finalAccentColor = [60, 1.0, 0.85]; // Default Yellow fallback HSL
let finalTextColor = '#FFFFFF'; // Default White fallback string

// --- State for fallback/night mode ---
let lastSuccessfulImageUrl = null; // Keep this for fallback *during* prepare if fetch fails
let lastSuccessfulTintColor = [...finalTintColor];
let lastSuccessfulAccentColor = [...finalAccentColor];
let lastSuccessfulTextColor = finalTextColor;

// --- Global variables for the *next* state to be applied during swap ---
let nextBackgroundUrl = null;
let nextTintColor = [...finalTintColor]; // Initialize with current/default
let nextAccentColor = [...finalAccentColor]; // Initialize with current/default
let nextTextColor = finalTextColor; // Initialize with current/default

// --- Constants (Copied from unsplash.js for preloadBackground) ---
const UNSPLASH_API_KEY = 'b1aba212129c0b620676e76d3a0e8941a5323a667e818f98af77942b54527077'; // Consider moving API Key
const UNSPLASH_API_URL = 'https://api.unsplash.com/photos/random';
const IMAGE_WIDTH = 1280;
const IMAGE_HEIGHT = 800;


// --- Unsplash API Fetching & Image Preloading (Copied from unsplash.js) ---
// TODO: Refactor later to avoid duplication if possible
function preloadImage(url) {
    console.log("Preloading image:", url);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            console.log("Image successfully preloaded:", url);
            resolve(url); // Resolve with the URL *after* loading
        };
        img.onerror = (err) => {
            console.error("Error preloading image:", url, err);
            reject(new Error("Failed to preload image"));
        };
        img.src = url; // Start loading
    });
}

async function fetchUnsplashUrl() {
    console.log("Fetching new background image URL...");
    const params = new URLSearchParams({
        orientation: 'landscape',
        collections: '317099',
        content_filter: 'low',
        w: IMAGE_WIDTH,
        h: IMAGE_HEIGHT,
        fit: 'crop',
        q: 80,
        c: (new Date).getTime(), // Cache buster
    });

    try {
        const response = await fetch(`${UNSPLASH_API_URL}?${params}`, {
            headers: {
                'Authorization': `Client-ID ${UNSPLASH_API_KEY}`,
                'Accept-Version': 'v1'
            }
        });

        if (!response.ok) {
            console.error('Unsplash API Error:', response.status, await response.text());
            throw new Error(`Failed to fetch image URL (${response.status})`);
        }

        const data = await response.json();
        if (!data || !data.urls || !data.urls.raw) {
            console.error('Invalid data received from Unsplash:', data);
            throw new Error('Invalid data received from Unsplash');
        }

        // Construct the final URL with specific dimensions and crop parameters
        const finalUrl = `${data.urls.raw}&w=${IMAGE_WIDTH}&h=${IMAGE_HEIGHT}&fit=crop&q=80&auto=format`;
        return finalUrl;

    } catch (error) {
        console.error('Error fetching Unsplash photo URL:', error);
        throw error; // Re-throw to be caught by caller
    }
}


// --- Helper to find preferred color ---
function findColor(prefs, swatchesMap, fallbackHsl) {
    for (const name of prefs) {
        if (swatchesMap[name] && swatchesMap[name].hsl) {
            console.log(`Found preferred color '${name}':`, swatchesMap[name].hsl);
            return [...swatchesMap[name].hsl]; // Return a copy
        }
    }
    console.log(`No preferred color found in [${prefs.join(', ')}], using fallback.`);
    // Ensure fallback is always returned as a *copy* if it's an array
    return Array.isArray(fallbackHsl) ? [...fallbackHsl] : fallbackHsl;
}

// --- Night Time Check Helper ---
function isNightTime(dateToCheck) {
    // Calculate time 2 seconds from now
    const futureTime = new Date(dateToCheck.getTime() + 2 * 1000);
    const futureHour = futureTime.getHours();

    // Night hours: 11 PM (23) or 0 AM to 5 AM (0-5)
    const isNight = futureHour === 23 || (futureHour >= 0 && futureHour <= 5);
    console.log(`Checking night time for ${futureTime.toLocaleTimeString()}: hour=${futureHour}, isNight=${isNight}`);
    return isNight;
}

// --- Prepare Background: Preload and Extract Colors, Set *Next* State ---
async function prepareBackground() {
    console.log("Preparing next background state...");

    // --- Night Mode Check (using time 2 seconds from now) ---
    if (isNightTime(new Date())) {
        console.log(`Night mode active (based on time 2 seconds from now). Setting next state for night.`);
        // Set next state for night mode
        nextBackgroundUrl = null;
        nextTintColor = 'black'; // Use string for black background tint
        nextAccentColor = [20, 1.0, 0.25]; // HSL(20, 100%, 25%) - Dark Red/Brownish
        nextTextColor = [20, 1.0, 0.15]; // HSL(20, 100%, 15%) - Very Dark Red/Brownish

        console.log("Next state prepared (Night):", { nextBackgroundUrl, nextTintColor, nextAccentColor, nextTextColor });
        // DO NOT update DOM or CSS variables here.
        // DO NOT return anything.
        return;
    }

    // --- Fetch, Preload, and Process Image (Day Time) ---
    let fetchedImageUrl = null;
    try {
        fetchedImageUrl = await fetchUnsplashUrl();
        console.log("Image URL fetched:", fetchedImageUrl);

        // Preload the image (don't wait for color extraction)
        // We resolve this promise later, but start loading now.
        const preloadPromise = preloadImage(fetchedImageUrl);

        console.log("Extracting colors using Vibrant.js from:", fetchedImageUrl);
        const img = document.createElement('img');
        img.crossOrigin = "Anonymous";

        const swatchesMap = await new Promise((resolve, reject) => {
            img.onload = () => {
                try {
                    console.log("Image element loaded for Vibrant.js");
                    const vibrant = new Vibrant(img, undefined, 20); // Use default quality (undefined), lower color count (20)
                    const swatches = vibrant.swatches();
                    console.log("Vibrant swatches:", swatches);

                    const extractedMap = {};
                    const swatchNames = ['Vibrant', 'Muted', 'DarkVibrant', 'DarkMuted', 'LightVibrant', 'LightMuted'];

                    swatchNames.forEach(name => {
                        const swatch = swatches[name];
                        if (swatch) {
                            extractedMap[name] = { hsl: swatch.getHsl() }; // Store HSL [0-360, 0-1, 0-1]
                        } else {
                            console.warn(`Swatch ${name} not found.`);
                            extractedMap[name] = { hsl: null };
                        }
                    });
                    resolve(extractedMap);
                } catch (vibrantError) {
                    console.error("Error using Vibrant.js:", vibrantError);
                    reject(vibrantError);
                }
            };
            img.onerror = (err) => {
                console.error("Error loading image element for Vibrant.js:", fetchedImageUrl, err);
                reject(new Error("Failed to load image element for Vibrant.js"));
            };
            img.src = fetchedImageUrl; // Start loading image data for Vibrant
        });

        console.log("Extracted swatches map:", swatchesMap);

        // --- Determine Tint, Accent, and Text Colors ---
        const tintPrefs = ['DarkVibrant', 'DarkMuted', 'Muted'];
        const accentPrefs = ['LightVibrant', 'LightMuted', 'Vibrant'];
        // Static fallbacks: Teal HSL(180, 50%, 15%), Yellow HSL(60, 100%, 85%), White #FFFFFF
        const staticTintHsl = [180, 0.5, 0.15];
        const staticAccentHsl = [60, 1.0, 0.85];
        const staticTextColor = '#FFFFFF'; // Day text color is white

        let tintHsl = findColor(tintPrefs, swatchesMap, staticTintHsl);
        let accentHsl = findColor(accentPrefs, swatchesMap, staticAccentHsl);

        // Adjust Lightness (L component is index 2, range 0-1)
        tintHsl[2] = 0.20; // Ensure tint is dark
        accentHsl[2] = 0.90; // Ensure accent is light

        console.log("Selected Tint HSL (adjusted):", tintHsl);
        console.log("Selected Accent HSL (adjusted):", accentHsl);
        console.log("Selected Text Color (Day):", staticTextColor);

        // Wait for the image preload to complete *before* setting the next state
        await preloadPromise;
        console.log("Image preload confirmed complete.");

        // Set the *next* state variables
        nextBackgroundUrl = fetchedImageUrl; // Use the successfully preloaded URL
        nextTintColor = tintHsl;
        nextAccentColor = accentHsl;
        nextTextColor = staticTextColor; // Day text is always white

        // Update last successful state *only* after successful fetch, preload, and color extraction
        lastSuccessfulImageUrl = fetchedImageUrl;
        lastSuccessfulTintColor = [...tintHsl];
        lastSuccessfulAccentColor = [...accentHsl];
        lastSuccessfulTextColor = staticTextColor;

        console.log("Next state prepared (Day):", { nextBackgroundUrl, nextTintColor, nextAccentColor, nextTextColor });
        // DO NOT update DOM or CSS variables here.
        // DO NOT return anything.

    } catch (error) {
        console.error("Failed to prepare background (fetch/preload/vibrant error):", error);
        // IMPORTANT: If any part fails, DO NOT change the 'next' variables.
        // The swap will use the *previous* 'next' values (which might be from the last successful run or night mode).
        console.log("Keeping previous 'next' state due to error.");
        // DO NOT return anything.
    }
}


// --- Helper to convert HSL array/string to CSS string ---
function toCssColor(colorValue) {
    if (typeof colorValue === 'string') {
        return colorValue; // Assumed to be 'black' or '#FFFFFF' etc.
    }
    if (Array.isArray(colorValue) && colorValue.length === 3) {
        // HSL: [h, s, l] where s and l are 0-1
        return `hsl(${(colorValue[0] * 360).toFixed(0)}, ${(colorValue[1] * 100).toFixed(0)}%, ${(colorValue[2] * 100).toFixed(0)}%)`;
    }
    console.warn("Invalid color value encountered:", colorValue, "- falling back to white");
    return '#FFFFFF'; // Fallback
}

// --- Background Swapping with Transition & Color Application ---
function swapBackground() {
    console.log("Starting background swap using prepared state:", { nextBackgroundUrl, nextTintColor, nextAccentColor, nextTextColor });
    const overlayElement = document.getElementById('overlay');
    const backgroundDiv = document.getElementById('background'); // Get the background div itself
    // We will set CSS variables, so don't need direct element refs for tint/text anymore

    if (!overlayElement || !backgroundDiv) {
        console.error("Required elements for background swap (overlay, background) not found.");
        return;
    }

    // --- Fade Out (Cover with Black) ---
    console.log("Fading out overlay (to black)...");
    overlayElement.style.transition = 'opacity 1s ease-in-out'; // Ensure transition is set
    overlayElement.style.opacity = 1;

    // --- Wait for Fade Out, Swap Image/Color, Apply Colors, Fade In ---
    setTimeout(() => {
        console.log("Overlay faded out. Applying next background and colors.");

        // 1. Set Background (Image or Black)
        if (nextBackgroundUrl === null) {
            // Night mode or error fallback where URL is explicitly null
            console.log("Setting background div to black color.");
            backgroundDiv.style.backgroundImage = 'none'; // Remove any image
            backgroundDiv.style.backgroundColor = 'black'; // Set background color to black
        } else {
            // Day mode with a valid image URL
            console.log("Setting background div image:", nextBackgroundUrl);
            backgroundDiv.style.backgroundColor = 'transparent'; // Ensure color doesn't interfere
            backgroundDiv.style.backgroundImage = `url('${nextBackgroundUrl}')`; // Set the background image URL
            // CSS should handle size/position (e.g., background-size: cover)
        }

        // 2. Apply Next Colors via CSS Variables
        const cssTintColor = toCssColor(nextTintColor);
        const cssAccentColor = toCssColor(nextAccentColor);
        const cssTextColor = toCssColor(nextTextColor);

        console.log("Setting color variables");
        // console.log("--tint-color:", cssTintColor);
        // console.log("--accent-color:", cssAccentColor);
        // console.log("--text-color:", cssTextColor);

        document.documentElement.style.setProperty('--tint-color', cssTintColor);
        document.documentElement.style.setProperty('--accent-color', cssAccentColor);
        document.documentElement.style.setProperty('--text-color', cssTextColor);

        // 3. Set Rain Color based on time
        const cssRainColor = (nextBackgroundUrl === null) ? cssTextColor : '#7FFFFF'; // Night: text color, Day: #7FFFFF
        console.log("--rain-color:", cssRainColor);
        document.documentElement.style.setProperty('--rain-color', cssRainColor);

        // 4. Add/Remove night-tint class to weather icon (handled by updateWeather)


        // 5. Update Current Global Colors to Match Applied State
        // Use deep copy for arrays to avoid reference issues
        finalTintColor = Array.isArray(nextTintColor) ? [...nextTintColor] : nextTintColor;
        finalAccentColor = Array.isArray(nextAccentColor) ? [...nextAccentColor] : nextAccentColor;
        finalTextColor = Array.isArray(nextTextColor) ? [...nextTextColor] : nextTextColor;
        console.log("Updated final colors to match applied state:", { finalTintColor, finalAccentColor, finalTextColor });

        // 6. Trigger weather update to apply new theme to icons
        if (typeof updateWeather === 'function') {
            updateWeather();
        }


        // --- Fade In (Reveal New Background and Colors) ---
        // Use another timeout to ensure the swap is complete before revealing
        setTimeout(() => {
            console.log("Fading in overlay (revealing new background and colors)...");
            overlayElement.style.opacity = 0;
        }, 1000); // 1 second delay after swap before fade-in starts

    }, 1000); // Wait 1 second (matching fade-out duration)
}
