// --- Constants (Consider moving API Key to a config or environment variable later) ---
const UNSPLASH_API_KEY = 'b1aba212129c0b620676e76d3a0e8941a5323a667e818f98af77942b54527077';
const UNSPLASH_API_URL = 'https://api.unsplash.com/photos/random';
const IMAGE_WIDTH = 1280;
const IMAGE_HEIGHT = 800;

// --- DOM Elements (Accessed within functions) ---
// Note: We'll get these elements inside the functions when needed to ensure
// they exist when the script runs.

// --- Unsplash API Fetching & Image Preloading ---
function preloadBackground() { // Changed to return a Promise manually
    console.log("Fetching new background image URL...");
    return new Promise(async (resolve, reject) => { // Wrap in a Promise
        const params = new URLSearchParams({
            orientation: 'landscape',
            // topics: 'wallpapers',
            collections: '317099',
            // query: 'nature,wallpaper', // Added 'nature' for variety
            content_filter: 'low',
            // Requesting raw and then adding params might be better for caching,
            // but let's stick to the provided example structure for now.
            w: IMAGE_WIDTH,
            h: IMAGE_HEIGHT,
            fit: 'crop',
            c: (new Date).getTime(), 
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
            throw new Error(`Failed to fetch image (${response.status})`);
        }

        const data = await response.json();
        if (!data || !data.urls || !data.urls.raw) { // Simplified check
             console.error('Invalid data received from Unsplash:', data);
             throw new Error('Invalid data received from Unsplash');
        }

        // Construct the final URL with specific dimensions and crop parameters
        // Ensure these params are correctly applied by Unsplash
        const finalUrl = `${data.urls.raw}&w=${IMAGE_WIDTH}&h=${IMAGE_HEIGHT}&fit=crop&q=80&auto=format`; // Added quality & format

        console.log("Preload complete:", finalUrl);
        console.log("Image URL fetched:", finalUrl);

        // Now, actually preload the image
        const img = new Image();
        img.onload = () => {
            console.log("Image successfully preloaded:", finalUrl);
            resolve(finalUrl); // Resolve the promise with the URL *after* loading
        };
        img.onerror = (err) => {
            console.error("Error preloading image:", finalUrl, err);
            reject(new Error("Failed to preload image")); // Reject the promise on error
        };
        img.src = finalUrl; // Start loading the image

    } catch (error) {
        console.error('Error fetching or processing Unsplash photo:', error);
        reject(error); // Reject the promise if API fetch fails
    }
}); // Close the async function and the Promise constructor
}

// --- Background Swapping with Transition ---
// function swapBackground(newImageUrl) {
//     console.log("Starting background swap for:", newImageUrl);
//     const overlayElement = document.getElementById('overlay');
//     const backgroundImageElement = document.getElementById('bg-image'); // Corrected ID

//     if (!overlayElement || !backgroundImageElement) {
//         console.error("Required elements for background swap not found.");
//         return;
//     }
//     if (!newImageUrl) {
//         console.error("No new image URL provided for swap.");
//         return; // Don't proceed if the preload failed
//     }

//     // 1. Start Fade In Overlay (1s duration from CSS)
//     console.log("Starting overlay fade-in.");
//     overlayElement.style.opacity = '1';

//     // 2. After fade-in completes (1s), swap image and wait 1s
//     setTimeout(() => {
//         console.log("Fade-in complete. Setting new background image source.");
//         backgroundImageElement.src = newImageUrl;

//         // 3. After the 1s wait, start fading out overlay (1s duration from CSS)
//         setTimeout(() => {
//             console.log("Starting overlay fade-out.");
//             overlayElement.style.opacity = '0';
//         }, 1000); // Wait 1 second with black screen before starting fade-out

//     }, 1000); // Wait 1 second for the fade-in transition to complete

//     // The total visual process:
//     // 0.0s - 1.0s: Fade to black
//     // 1.0s - 2.0s: Black screen (image swapped at 1.0s mark)
//     // 2.0s - 3.0s: Fade back to image
// }
