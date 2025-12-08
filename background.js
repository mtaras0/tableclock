// --- Global variables for final colors ---
let finalTintColor = [180, 0.5, 0.15]; // Default Teal fallback HSL [h, s, l]
let finalAccentColor = [60, 1.0, 0.85]; // Default Yellow fallback HSL
let finalTextColor = '#FFFFFF'; // Default White fallback string

// --- State for fallback/night mode ---
let lastSuccessfulImageUrl = null;
let lastSuccessfulTintColor = [...finalTintColor];
let lastSuccessfulAccentColor = [...finalAccentColor];
let lastSuccessfulTextColor = finalTextColor;

// --- Global variables for the *next* state to be applied during swap ---
let nextBackgroundUrl = null;
let nextTintColor = [...finalTintColor];
let nextAccentColor = [...finalAccentColor];
let nextTextColor = finalTextColor;

// --- Constants ---
const UNSPLASH_WORKER_URL = 'https://unsplash-random.mukintaras.workers.dev';

// --- Memory Management Helper ---
// We keep track of the blob URL currently displayed to revoke it later (save memory on old hardware)
let currentBlobUrl = null;

// --- Unsplash API Fetching & Image Preloading ---

// 1. Get Screen Resolution
function getScreenResolution() {
    // Use devicePixelRatio to get physical pixels (better for Retina/HighDPI), 
    // or fallback to standard screen size.
    // Chrome 2018 supports window.screen and devicePixelRatio.
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.screen.width * ratio);
    const h = Math.round(window.screen.height * ratio);
    console.log(`Detected Screen Resolution: ${w}x${h}`);
    return { w, h };
}

function preloadImage(url) {
    console.log("Preloading image blob:", url);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            console.log("Image successfully preloaded");
            resolve(url);
        };
        img.onerror = (err) => {
            console.error("Error preloading image:", err);
            reject(new Error("Failed to preload image"));
        };
        img.src = url;
    });
}

// Now returns an ObjectURL (Blob) instead of a remote string
async function fetchNewBackgroundBlob() {
    console.log("Contacting worker to proxy new image...");

    const { w, h } = getScreenResolution();

    // Pass resolution to worker
    const params = new URLSearchParams({
        w: w,
        h: h,
        t: Date.now() // Cache buster to ensure worker runs fresh logic
    });

    try {
        // Fetch the binary data directly from the worker
        const response = await fetch(`${UNSPLASH_WORKER_URL}?${params}`);

        if (!response.ok) {
            console.error('Worker Error:', response.status);
            throw new Error(`Failed to fetch image from worker (${response.status})`);
        }

        // Convert the response stream into a Blob (File in memory)
        const blob = await response.blob();

        // Create a local URL pointing to this memory location
        // This is much faster for Vibrant.js and Background assignment 
        // as it prevents re-downloading.
        const objectUrl = URL.createObjectURL(blob);
        console.log("Created local ObjectURL:", objectUrl);

        return objectUrl;

    } catch (error) {
        console.error('Error fetching image blob:', error);
        throw error;
    }
}


// --- Helper to find preferred color ---
function findColor(prefs, swatchesMap, fallbackHsl) {
    for (const name of prefs) {
        if (swatchesMap[name] && swatchesMap[name].hsl) {
            console.log(`Found preferred color '${name}':`, swatchesMap[name].hsl);
            return [...swatchesMap[name].hsl];
        }
    }
    console.log(`No preferred color found in [${prefs.join(', ')}], using fallback.`);
    return Array.isArray(fallbackHsl) ? [...fallbackHsl] : fallbackHsl;
}

// --- Night Time Check Helper ---
function isNightTime(dateToCheck) {
    const futureTime = new Date(dateToCheck.getTime() + 2 * 1000);
    const futureHour = futureTime.getHours();
    const isNight = futureHour === 23 || (futureHour >= 0 && futureHour <= 7);
    console.log(`Checking night time: ${futureHour}, isNight=${isNight}`);
    return isNight;
}

// --- Prepare Background: Preload and Extract Colors ---
async function prepareBackground() {
    console.log("Preparing next background state...");

    if (isNightTime(new Date())) {
        console.log(`Night mode active.`);
        nextBackgroundUrl = null;
        nextTintColor = 'black';
        nextAccentColor = [20, 1.0, 0.25];
        nextTextColor = [20, 1.0, 0.15];
        return;
    }

    let fetchedObjectUrl = null;
    try {
        // Fetch the image data (Blob)
        fetchedObjectUrl = await fetchNewBackgroundBlob();

        // Start preloading the Blob URL
        const preloadPromise = preloadImage(fetchedObjectUrl);

        console.log("Extracting colors using Vibrant.js...");
        const img = document.createElement('img');
        // No crossOrigin needed for ObjectURLs, but good practice
        img.crossOrigin = "Anonymous";

        const swatchesMap = await new Promise((resolve, reject) => {
            img.onload = () => {
                try {
                    const vibrant = new Vibrant(img, undefined, 20);
                    const swatches = vibrant.swatches();
                    const extractedMap = {};
                    const swatchNames = ['Vibrant', 'Muted', 'DarkVibrant', 'DarkMuted', 'LightVibrant', 'LightMuted'];

                    swatchNames.forEach(name => {
                        const swatch = swatches[name];
                        if (swatch) {
                            extractedMap[name] = { hsl: swatch.getHsl() };
                        } else {
                            extractedMap[name] = { hsl: null };
                        }
                    });
                    resolve(extractedMap);
                } catch (vibrantError) {
                    reject(vibrantError);
                }
            };
            img.onerror = (err) => reject(new Error("Failed to load image for Vibrant"));
            img.src = fetchedObjectUrl;
        });

        const tintPrefs = ['DarkVibrant', 'DarkMuted', 'Muted'];
        const accentPrefs = ['LightVibrant', 'LightMuted', 'Vibrant'];
        const staticTintHsl = [180, 0.5, 0.15];
        const staticAccentHsl = [60, 1.0, 0.85];
        const staticTextColor = '#FFFFFF';

        let tintHsl = findColor(tintPrefs, swatchesMap, staticTintHsl);
        let accentHsl = findColor(accentPrefs, swatchesMap, staticAccentHsl);

        tintHsl[2] = 0.20;
        accentHsl[2] = 0.90;

        await preloadPromise;
        console.log("Image preload confirmed.");

        nextBackgroundUrl = fetchedObjectUrl;
        nextTintColor = tintHsl;
        nextAccentColor = accentHsl;
        nextTextColor = staticTextColor;

        // Update last successful state
        lastSuccessfulImageUrl = fetchedObjectUrl;
        lastSuccessfulTintColor = [...tintHsl];
        lastSuccessfulAccentColor = [...accentHsl];
        lastSuccessfulTextColor = staticTextColor;

    } catch (error) {
        console.error("Failed to prepare background:", error);
        // If we created a blob but failed afterwards, revoke it to save memory
        if (fetchedObjectUrl) {
            URL.revokeObjectURL(fetchedObjectUrl);
        }
    }
}


// --- Helper to convert HSL array/string to CSS string ---
function toCssColor(colorValue) {
    if (typeof colorValue === 'string') {
        return colorValue;
    }
    if (Array.isArray(colorValue) && colorValue.length === 3) {
        return `hsl(${(colorValue[0] * 360).toFixed(0)}, ${(colorValue[1] * 100).toFixed(0)}%, ${(colorValue[2] * 100).toFixed(0)}%)`;
    }
    return '#FFFFFF';
}

// --- Background Swapping ---
function swapBackground() {
    if (isNightTime(new Date())) {
        nextBackgroundUrl = null;
        nextTintColor = 'black';
        nextAccentColor = [20, 1.0, 0.25];
        nextTextColor = [20, 1.0, 0.15];
    }

    const overlayElement = document.getElementById('overlay');
    const backgroundDiv = document.getElementById('background');

    if (!overlayElement || !backgroundDiv) return;

    overlayElement.style.transition = 'opacity 1s ease-in-out';
    overlayElement.style.opacity = 1;

    setTimeout(() => {
        // 1. Set Background
        if (nextBackgroundUrl === null) {
            backgroundDiv.style.backgroundImage = 'none';
            backgroundDiv.style.backgroundColor = 'black';

            // Cleanup: If we were showing a blob before, release memory
            if (currentBlobUrl) {
                console.log("Revoking old blob URL:", currentBlobUrl);
                URL.revokeObjectURL(currentBlobUrl);
                currentBlobUrl = null;
            }

        } else {
            backgroundDiv.style.backgroundColor = 'transparent';
            backgroundDiv.style.backgroundImage = `url('${nextBackgroundUrl}')`;

            // Cleanup: Release the *previous* blob URL, keep the new one
            if (currentBlobUrl && currentBlobUrl !== nextBackgroundUrl) {
                console.log("Revoking old blob URL:", currentBlobUrl);
                URL.revokeObjectURL(currentBlobUrl);
            }
            currentBlobUrl = nextBackgroundUrl;
        }

        // 2. Apply Colors
        const cssTintColor = toCssColor(nextTintColor);
        const cssAccentColor = toCssColor(nextAccentColor);
        const cssTextColor = toCssColor(nextTextColor);

        document.documentElement.style.setProperty('--tint-color', cssTintColor);
        document.documentElement.style.setProperty('--accent-color', cssAccentColor);
        document.documentElement.style.setProperty('--text-color', cssTextColor);

        // 3. Set Rain Color
        const cssRainColor = (nextBackgroundUrl === null) ? cssTextColor : '#7FFFFF';
        document.documentElement.style.setProperty('--rain-color', cssRainColor);

        // 4. Night Mode Class
        const weatherContainer = document.getElementById('weather');
        if (weatherContainer) {
            if (nextBackgroundUrl === null) {
                weatherContainer.classList.add('night-mode');
            } else {
                weatherContainer.classList.remove('night-mode');
            }
        }

        // 5. Update Globals
        finalTintColor = Array.isArray(nextTintColor) ? [...nextTintColor] : nextTintColor;
        finalAccentColor = Array.isArray(nextAccentColor) ? [...nextAccentColor] : nextAccentColor;
        finalTextColor = Array.isArray(nextTextColor) ? [...nextTextColor] : nextTextColor;

        if (typeof updateWeather === 'function') {
            updateWeather();
        }

        setTimeout(() => {
            overlayElement.style.opacity = 0;
        }, 1000);

    }, 1000);
}