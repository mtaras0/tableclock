/**
 * TabletClock Weather Processor
 * 
 * Logic ported from:
 * - sources/yr_no.py
 * - processors/shared.py
 * - processors/tabletclock_interesting.py
 */



const USER_AGENT = "weather-center/1.0 (https://github.com/yourusername/weather-center)";

// Modified to accept lat and lon
async function _fetchWeatherFromAPI(lat, lon) {
    const WEATHER_API_URL = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`;
    // 1. Fetch Data
    let apiData;
    try {
        const response = await fetch(WEATHER_API_URL, {
            headers: {
                "User-Agent": USER_AGENT
            }
        });
        if (!response.ok) {
            console.error(`Error fetching data: HTTP Status ${response.status}`);
            return null;
        }
        apiData = await response.json();
    } catch (e) {
        console.error(`An unexpected error occurred during fetch: ${e}`);
        return null;
    }

    if (!apiData) return null;

    try {
        const timeseries = apiData.properties.timeseries;
        const currentRaw = timeseries[0];

        // 2. Parse Current Data
        const currentData = {};
        const currentDt = new Date(currentRaw.time);
        currentData.time = currentDt.toISOString();

        const currentDetails = currentRaw.data.instant.details;
        currentData.temp = roundValue(currentDetails.air_temperature);
        currentData.flik = currentData.temp;
        currentData.clouds = roundValue(currentDetails.cloud_area_fraction);

        const currentNext1Hour = currentRaw.data.next_1_hours;
        if (currentNext1Hour) {
            const details = currentNext1Hour.details;
            currentData.precip = roundValue(details.precipitation_amount || 0.0);
            currentData.precip_prob = roundValue(details.probability_of_precipitation || 0.0);
            currentData.uvi = roundValue(details.ultraviolet_index_clear_sky_max || 0.0);
            
            const symbolCode = currentNext1Hour.summary.symbol_code;
            if (symbolCode.includes("day")) {
                currentData.is_day = 1;
            } else if (symbolCode.includes("night")) {
                currentData.is_day = 0;
            } else {
                const hour = currentDt.getHours();
                currentData.is_day = (hour >= 6 && hour < 18) ? 1 : 0;
            }

            if (symbolCode.includes("snow")) {
                currentData.snow_fraction = 1.0;
            } else if (symbolCode.includes("sleet")) {
                currentData.snow_fraction = 0.5;
            } else {
                currentData.snow_fraction = 0.0;
            }
        } else {
            currentData.precip = 0.0;
            currentData.precip_prob = 0.0;
            currentData.uvi = 0.0;
            currentData.is_day = 1;
            currentData.snow_fraction = 0.0;
        }

        // 3. Parse Forecast Data (Structure of Arrays)
        const forecastKeys = ["time", "temp", "flik", "clouds", "precip", "precip_prob", "uvi", "is_day", "snow_fraction"];
        const forecastData = {};
        forecastKeys.forEach(k => forecastData[k] = []);

        for (let i = 1; i < timeseries.length; i++) {
            const entry = timeseries[i];
            const dtLocal = new Date(entry.time);
            
            forecastData.time.push(dtLocal.toISOString());

            const details = entry.data.instant.details;
            const temp = roundValue(details.air_temperature);
            forecastData.temp.push(temp);
            forecastData.flik.push(temp);
            forecastData.clouds.push(roundValue(details.cloud_area_fraction));

            const next1Hour = entry.data.next_1_hours;
            if (next1Hour) {
                const nDetails = next1Hour.details;
                forecastData.precip.push(roundValue(nDetails.precipitation_amount || 0.0));
                forecastData.precip_prob.push(roundValue(nDetails.probability_of_precipitation || 0.0));
                forecastData.uvi.push(roundValue(nDetails.ultraviolet_index_clear_sky_max || 0.0));
                
                const symbolCode = next1Hour.summary.symbol_code;
                let isDay;
                if (symbolCode.includes("day")) {
                    isDay = 1;
                } else if (symbolCode.includes("night")) {
                    isDay = 0;
                } else {
                    const hour = dtLocal.getHours();
                    isDay = (hour >= 6 && hour < 18) ? 1 : 0;
                }
                forecastData.is_day.push(isDay);

                if (symbolCode.includes("snow")) {
                    forecastData.snow_fraction.push(1.0);
                } else if (symbolCode.includes("sleet")) {
                    forecastData.snow_fraction.push(0.5);
                } else {
                    forecastData.snow_fraction.push(0.0);
                }
            } else {
                forecastData.precip.push(0.0);
                forecastData.precip_prob.push(0.0);
                forecastData.uvi.push(0.0);
                forecastData.is_day.push(1);
                forecastData.snow_fraction.push(0.0);
            }
        }

        const weatherData = { "current": currentData, "forecast": forecastData };

        // 4. Analyze (Determine Next)
        const nextEvent = determineNext(currentData, forecastData);

        // 5. Format Output
        const nextIndex = nextEvent.index;
        const nextReason = nextEvent.reason;
        let nextDataStr = "--";

        if (nextIndex >= 0 && nextIndex < forecastData.time.length) {
            const nextSegment = timeSegmentData(forecastData, nextIndex);
            const isoTime = nextSegment.time;

            if (isoTime) {
                const arrows = {
                    "temp max": "↑",
                    "temp min": "↓",
                    "rain stronger": "↗",
                    "rain weaker": "↘",
                    "temp drop": "↘",
                };
                const arrowChar = arrows[nextReason] || "";
                
                let arrowClasses = "arrow-symbol";
                if (nextReason.includes("rain")) {
                    arrowClasses += " rain-change-symbol";
                }

                const arrowHtml = `<span class="${arrowClasses}">${arrowChar}</span>`;

                let conditionHtml;
                if (nextReason.includes("rain")) {
                    const iconName = determineIcon(nextSegment);
                    const iconHtml = `<img src="icons/${iconName}.png" class="weather-icon" style="display: inline;">`;
                    conditionHtml = `${arrowHtml}${iconHtml}`;
                } else {
                    const temp = Math.round(nextSegment.temp || 0);
                    conditionHtml = `${arrowHtml}${temp}°`;
                }

                // Time formatting
                const eventTime = new Date(isoTime);
                let hour = eventTime.getHours();
                if (eventTime.getMinutes() > 30) {
                    hour = (hour + 1) % 24;
                }
                const timeDisplay = hour.toString().padStart(2, '0');
                
                const timeHtml = `<span style="color: var(--accent-color);">${timeDisplay}:</span>`;
                nextDataStr = `${timeHtml}&#8201;${conditionHtml}`;
            }
        }

        const finalOutput = {
            "now": {
                "temp": Math.round(currentData.temp),
                "icon": determineIcon(currentData) + ".png",
                "uvi": currentData.uvi || 0.0
            },
            "next": nextDataStr
        };

        return finalOutput;

    } catch (e) {
        console.error("An unexpected error occurred during raw data processing:", e);
        return null;
    }
}

// New exported function that handles geolocation
async function getTabletClockWeather() {
    return new Promise((resolve) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    console.log("Geolocation successful:", position.coords.latitude, position.coords.longitude);
                    const weatherData = await _fetchWeatherFromAPI(position.coords.latitude, position.coords.longitude);
                    resolve(weatherData);
                },
                async (error) => {
                    console.warn("Geolocation failed, using fallback coordinates (0,0):", error.message);
                    const weatherData = await _fetchWeatherFromAPI(0, 0); // Fallback to 0,0
                    resolve(weatherData);
                },
                {
                    enableHighAccuracy: false, // Geolocation options
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        } else {
            console.warn("Geolocation is not supported by this browser, using fallback coordinates (0,0).");
            _fetchWeatherFromAPI(0, 0).then(resolve); // Fallback to 0,0
        }
    });
}

// Export the function so it can be used/imported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getTabletClockWeather };
}
// If running in browser, it will just be a global function.
