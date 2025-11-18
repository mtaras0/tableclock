(function() {
    // Get references to DOM elements
    var clockElement = document.getElementById('clock');
    var fullscreenButton = document.getElementById('toggle-fullscreen');
    var refreshbgButton = document.getElementById('refresh-background');
    var docElement = document.documentElement;

    // --- State ---
    // let preloadedImageUrl = null; // No longer needed, state managed in background.js
    let prepareTimeoutId = null; // To potentially clear scheduled preparation
    let swapTimeoutId = null; // To potentially clear scheduled swap

    // --- Clock Update ---
    function updateTime() {
        var now = new Date();
        var hours = now.getHours();
        var minutes = now.getMinutes();

        // Pad with leading zero if needed (simple way)
        var hoursStr = String(hours); // < 10 ? '0' + hours : String(hours);
        var minutesStr = minutes < 10 ? '0' + minutes : String(minutes);

        // Update clock text
        // Use innerHTML for broader compatibility than textContent in very old browsers
        clockElement.innerHTML = hoursStr + ':' + minutesStr;

        // Update date and day of week
        updateDate();

        // Update weather information
        updateWeather(); // <-- Added this line

        // Calculate milliseconds until the start of the next minute
        var seconds = now.getSeconds();
        var milliseconds = now.getMilliseconds();
        // Delay = (seconds remaining * 1000) - milliseconds elapsed in current second
        var msUntilNextMinute = (60 - seconds) * 1000 - milliseconds;

        // Schedule the next update precisely
        // Use a minimum delay of 50ms just in case calculation yields 0 or negative
        setTimeout(updateTime, Math.max(50, msUntilNextMinute));
    }

    // --- Fullscreen API Abstraction (with vendor prefixes) ---
    function requestFullscreen() {
        // Standard
        if (docElement.requestFullscreen) {
            docElement.requestFullscreen();
        }
        // Firefox
        else if (docElement.mozRequestFullScreen) {
            docElement.mozRequestFullScreen();
        }
        // Chrome, Safari (older), Opera
        else if (docElement.webkitRequestFullscreen) {
            // Note: Some older webkit versions might need Element.ALLOW_KEYBOARD_INPUT
            // but keeping it simple first.
            docElement.webkitRequestFullscreen();
        }
        // IE/Edge
        else if (docElement.msRequestFullscreen) {
            docElement.msRequestFullscreen();
        } else {
            console.log("Fullscreen API is not supported.");
        }
    }

    function exitFullscreen() {
        // Standard
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        // Firefox
        else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        }
        // Chrome, Safari, Opera
        else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        // IE/Edge
        else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    function isFullscreen() {
        // Check multiple properties for cross-browser compatibility
        return !!(document.fullscreenElement || // Standard
            document.mozFullScreenElement || // Firefox
            document.webkitFullscreenElement || // Chrome, Safari, Opera
            document.msFullscreenElement); // IE/Edge
    }

    function toggleFullscreen() {
        if (!isFullscreen()) {
            requestFullscreen();
        } else {
            exitFullscreen();
        }
    }

    // --- Background Update Scheduling ---

    // Wrapper for async prepareBackground call
    async function prepareBackgroundWrapper() {
        console.log("Starting background preparation...");
        try {
            await prepareBackground(); // Call function from background.js - no return value expected
            console.log("Background preparation process initiated/completed.");
        } catch (error) {
            // Errors are handled within prepareBackground now, but log just in case.
            console.error("Unexpected error calling prepareBackground:", error);
        }
        // No need to store preloadedImageUrl here anymore.
    }

    // Performs the swap and schedules the next update cycle
    function performSwapAndReschedule() {
        console.log("Scheduled swap time reached. Performing background swap.");
        // Always call swapBackground. It uses the internally prepared state (nextBackgroundUrl, etc.)
        swapBackground(); // Call function from background.js (no arguments needed)

        // Schedule the *next* update cycle
        console.log("Scheduling next background update cycle.");
        scheduleNextBackgroundUpdate();
    }

    // Calculates timings and schedules the next preparation and swap
    function scheduleNextBackgroundUpdate() {
        // Clear any existing timers (important if this function is called manually or unexpectedly)
        if (prepareTimeoutId) clearTimeout(prepareTimeoutId);
        if (swapTimeoutId) clearTimeout(swapTimeoutId);

        const now = new Date();
        const intervalMinutes = 60; // Changed to 60 minutes for hourly updates
        const intervalMs = intervalMinutes * 60 * 1000;
        const prepareOffsetMs = 5 * 60 * 1000; // 5 minutes
        const swapOffsetMs = 1500; // 1.5 seconds before minute change

        // Calculate milliseconds past the start of the *current hour*
        const currentMs = now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds();
        const msIntoCurrentInterval = currentMs % intervalMs;
        const msUntilNextIntervalBoundary = intervalMs - msIntoCurrentInterval;

        let msUntilNextSwap = msUntilNextIntervalBoundary - swapOffsetMs;

        // If the calculated swap time is in the past (i.e., we are within 1.5s of the boundary or past it),
        // schedule for the *following* interval.
        if (msUntilNextSwap <= 0) {
            msUntilNextSwap += intervalMs;
        }

        let msUntilNextPreparation = msUntilNextSwap - prepareOffsetMs;

        const nextSwapTime = new Date(now.getTime() + msUntilNextSwap);
        const nextPrepTime = new Date(now.getTime() + msUntilNextPreparation);

        console.log(`Scheduling next background update. Current time: ${now.toLocaleTimeString()}`);
        console.log(` -> Next preparation scheduled for: ${nextPrepTime.toLocaleTimeString()} (in ${Math.round(msUntilNextPreparation / 1000)}s)`);
        console.log(` -> Next swap scheduled for: ${nextSwapTime.toLocaleTimeString()} (in ${Math.round(msUntilNextSwap / 1000)}s)`);

        // If preparation time is in the past or immediate, run it now.
        // Otherwise, schedule it.
        if (msUntilNextPreparation <= 0) {
            console.log("Preparation time is immediate or past, running now.");
            prepareBackgroundWrapper(); // Don't wait for it, let it run async
        } else {
            prepareTimeoutId = setTimeout(prepareBackgroundWrapper, msUntilNextPreparation);
        }

        // Always schedule the swap
        swapTimeoutId = setTimeout(performSwapAndReschedule, msUntilNextSwap);
    }

    // --- Initial Background Load --- (Replaces old initializeBackground)
    async function initialBackgroundLoadAndSchedule() {
        console.log("Performing initial background load...");
        await prepareBackgroundWrapper(); // Prepare the very first state

        console.log("Initial background state prepared, swapping immediately.");
        swapBackground(); // Perform the initial swap (no arguments needed)
        // preloadedImageUrl = null; // No longer needed

        // Start the regular update cycle
        console.log("Scheduling periodic background updates...");
        scheduleNextBackgroundUpdate();

        // Initialize date display and schedule daily updates
        updateDate();
        scheduleDailyUpdate();
    }

    async function refreshBackground() {
        console.log("Refreshing background...");
        // Call the function from background.js to refresh the background
        await prepareBackgroundWrapper(); // Prepare the new state
        swapBackground(); // Swap to the new background
    }

    // Update date and day of week
    function updateDate() {
        var now = new Date();
        var day = now.getDate();
        // var month = String(now.getMonth() + 1).padStart(2, '0');
        var dotw = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];

        document.getElementById('daydate').innerHTML = day;// + "." + month;
        document.getElementById('dotw').innerHTML = dotw;
    }

    // Schedule daily update at midnight
    function scheduleDailyUpdate() {
        var now = new Date();
        var hours = now.getHours();
        var minutes = now.getMinutes();
        var seconds = now.getSeconds();
        var milliseconds = now.getMilliseconds();

        // Calculate milliseconds until midnight
        var msUntilMidnight = (24 - hours) * 3600 * 1000 -
            minutes * 60 * 1000 -
            seconds * 1000 -
            milliseconds;

        // Schedule update at midnight and then every 24 hours
        setTimeout(function() {
            updateDate();
            setInterval(updateDate, 24 * 3600 * 1000);
        }, Math.max(50, msUntilMidnight));
    }

    // --- Initialization ---
    function initialize() {
        console.log("Initialization started.");
        // Initial time update on load
        updateTime();

        // Start the initial background load and schedule periodic updates.
        // This process will trigger the first weather update via swapBackground().
        initialBackgroundLoadAndSchedule();

        // Set up periodic weather updates
        if (typeof updateWeather === 'function') {
            // Update weather every 5 minutes (300000 milliseconds)
            setInterval(updateWeather, 300000);
        } else {
            console.error('updateWeather function not found. Make sure weather.js is loaded correctly.');
        }

        // Add click listener to the fullscreen button
        if (fullscreenButton.addEventListener) {
            fullscreenButton.addEventListener('click', toggleFullscreen, false);
        } else if (fullscreenButton.attachEvent) { // Fallback for older IE
            fullscreenButton.attachEvent('onclick', toggleFullscreen);
        }

        if (refreshbgButton.addEventListener) {
            console.log('Im here');
            refreshbgButton.addEventListener('click', refreshBackground, false);
        } else if (refreshbgButton.attachEvent) { // Fallback for older IE
            refreshbgButton.attachEvent('onclick', refreshBackground);
        }
    }

    // Run initialization when the DOM is ready (basic check)
    if (document.readyState === 'loading') { // Loading hasn't finished yet
        document.addEventListener('DOMContentLoaded', initialize);
    } else { // `DOMContentLoaded` has already fired
        initialize();
    }
})(); // End of IIFE
