/**
 * TabletClock Weather Processor
 * 
 * Logic ported from:
 * - sources/yr_no.py
 * - processors/shared.py
 * - processors/tabletclock_interesting.py
 */

const LATITUDE = 52.7632;
const LONGITUDE = 41.4034;
const WEATHER_API_URL = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${LATITUDE}&lon=${LONGITUDE}`;
const USER_AGENT = "weather-center/1.0 (https://github.com/yourusername/weather-center)"; // Replaced generic with slightly more specific to avoid 403 if strictly checked, though standard XHR/Fetch usually sets User-Agent.

const PRECIP_TRACE = 0.25;
const PRECIP_LIGHT = 2.5;
const PRECIP_MODERATE = 7.5;

/**
 * rounds a numerical value to a specified number of decimals.
 */
function roundValue(value, decimals = 2) {
    if (typeof value === 'number') {
        return parseFloat(value.toFixed(decimals));
    }
    return value;
}

/**
 * Calculates the rain/snow amount index based on precipitation and probability.
 */
function calculatePrecipAmountIndex(precip, probability) {
    if (precip < PRECIP_TRACE) {
        return 1;
    } else if (precip < PRECIP_LIGHT) {
        return probability > 50 ? 3 : 2;
    } else if (precip <= PRECIP_MODERATE) {
        return probability > 50 ? 4 : 3;
    } else {
        return probability > 50 ? 5 : 4;
    }
}

/**
 * Determines the weather icon name based on segment data.
 */
function determineIcon(timeSegment) {
    const precipitation = timeSegment.precip || 0;
    const precipitationProbability = timeSegment.precip_prob || 0;
    const snowFraction = timeSegment.snow_fraction || 0;
    const cloudCover = timeSegment.clouds || 0;
    const isDay = timeSegment.is_day !== undefined ? timeSegment.is_day : 1;

    if (precipitation >= PRECIP_TRACE) {
        let precipType;
        if (snowFraction < 0.25) {
            precipType = "rain";
        } else if (snowFraction <= 0.75) {
            precipType = "sleet";
        } else {
            precipType = "snow";
        }

        const probSuffix = precipitationProbability >= 50 ? "likely" : "unlikely";
        let strengthSuffix;

        if (precipitation < PRECIP_LIGHT) {
            strengthSuffix = "low";
        } else if (precipitation <= PRECIP_MODERATE) {
            strengthSuffix = "mid";
        } else {
            strengthSuffix = "high";
        }

        if (precipType === "rain") {
            return `${precipType}_${strengthSuffix}_${probSuffix}`;
        } else {
            return `${precipType}_${strengthSuffix}`;
        }

    } else {
        const daynightSuffix = isDay === 1 ? "day" : "night";
        let cloudsSuffix;

        if (cloudCover < 10) {
            cloudsSuffix = "clear";
        } else if (cloudCover < 35) {
            cloudsSuffix = "low";
        } else if (cloudCover < 60) {
            cloudsSuffix = "mid";
        } else if (cloudCover < 85) {
            cloudsSuffix = "high";
        } else {
            cloudsSuffix = "full";
        }

        if (cloudsSuffix === "clear") {
            return `clear_${daynightSuffix}`;
        } else if (cloudsSuffix === "full") {
            return `clouds_${cloudsSuffix}`;
        } else {
            return `clouds_${cloudsSuffix}_${daynightSuffix}`;
        }
    }
}

/**
 * Extracts data for a specific time segment (index) from the forecast dictionary (structure of arrays).
 */
function timeSegmentData(forecast, index) {
    try {
        // Handle case where forecast is structure of arrays
        const getVal = (key, i) => (forecast[key] && forecast[key][i] !== undefined) ? forecast[key][i] : 0;
        
        // Helper specifically for snow_fraction which might default to 0s
        const getSnow = (i) => {
            if (forecast.snow_fraction && forecast.snow_fraction[i] !== undefined) return forecast.snow_fraction[i];
            return 0;
        };
        
        // Helper for time
        const getTime = (i) => (forecast.time && forecast.time[i]) ? forecast.time[i] : null;

        return {
            "time": getTime(index),
            "temp": getVal("temp", index),
            "flik": getVal("flik", index),
            "precip": getVal("precip", index),
            "precip_prob": getVal("precip_prob", index),
            "clouds": getVal("clouds", index),
            "is_day": (forecast.is_day && forecast.is_day[index] !== undefined) ? forecast.is_day[index] : 1,
            "snow_fraction": getSnow(index),
        };
    } catch (e) {
        console.error(`Error accessing forecast data at index ${index}:`, e);
        return {
            "time": null,
            "temp": 0,
            "flik": 0,
            "precip": 0,
            "precip_prob": 0,
            "clouds": 0,
            "is_day": 1,
            "snow_fraction": 0,
        };
    }
}

/**
 * Determines the index and reason for the next significant weather event.
 * Expects 'forecast' to be a structure of arrays (keys map to arrays of values).
 */
function determineNext(current, forecast) {
    if (!forecast || !["time", "precip", "precip_prob", "temp"].every(k => forecast[k])) {
        return { "index": -1, "reason": "no forecast" };
    }
    if (!["precip", "precip_prob", "temp"].every(k => current.hasOwnProperty(k))) {
        return { "index": -1, "reason": "missing current data" };
    }

    // --- High Temperature Drop Check ---
    const currentTemp = current.temp;
    if (currentTemp >= 31) {
        const forecastTemps = forecast.temp;
        for (let i = 0; i < forecastTemps.length; i++) {
            if (forecastTemps[i] <= 30) {
                return { "index": i, "reason": "temp drop" };
            }
        }
    }

    // --- Precip Change Calculation ---
    const currentPrecip = current.precip;
    const currentProb = current.precip_prob;
    const currentPrecipIndex = calculatePrecipAmountIndex(currentPrecip, currentProb);

    const forecastPrecip = forecast.precip;
    const forecastProb = forecast.precip_prob;
    const numForecastSegments = forecastPrecip.length;

    if (numForecastSegments === 0) {
        return { "index": -1, "reason": "empty forecast" };
    }

    const forecastPrecipIndices = [];
    for (let i = 0; i < numForecastSegments; i++) {
        forecastPrecipIndices.push(calculatePrecipAmountIndex(forecastPrecip[i], forecastProb[i]));
    }

    for (let i = 0; i < numForecastSegments; i++) {
        const forecastRIndex = forecastPrecipIndices[i];
        let changeIndex;

        if (currentPrecipIndex === 0 || forecastRIndex === 0) {
            changeIndex = 1; // Logic from python: if either is 0? Wait. Python says:
            // if current_precip_index == 0 or forecast_r_index == 0: change_index = 1
            // But wait, if they are different and one is 0, shouldn't that be a change?
            // Python code:
            // if current_precip_index == 0 or forecast_r_index == 0:
            //    change_index = 1
            // elif forecast_r_index < current_precip_index: ...
            // This implies if one is 0, change_index is 1, so 1 >= 2 is False.
            // So it ignores changes involving index 0 (which seems to be an impossible index since min is 1? 
            // PRECIP_TRACE < 0.25 returns 1. So 0 is never returned by calculatePrecipAmountIndex?
            // Checking calculatePrecipAmountIndex... it returns 1, 2, 3, 4, 5. Never 0.
            // So currentPrecipIndex == 0 check is dead code or defensive.
            // I will keep it as is.
        } else if (forecastRIndex < currentPrecipIndex) {
            changeIndex = currentPrecipIndex / forecastRIndex;
        } else {
            changeIndex = forecastRIndex / currentPrecipIndex;
        }

        if (changeIndex >= 2) {
            const precipReason = forecastRIndex > currentPrecipIndex ? "rain stronger" : "rain weaker";
            return { "index": i, "reason": precipReason };
        }
    }

    // --- Temperature Extremum Calculation ---
    const forecastTemps = forecast.temp;
    const currentTempFloat = current.temp;
    const currentTempInt = Math.round(currentTempFloat);

    let minTemp = forecastTemps[0];
    let maxTemp = forecastTemps[0];
    let minTempIndex = 0;
    let maxTempIndex = 0;

    for (let i = 1; i < numForecastSegments; i++) {
        if (forecastTemps[i] < minTemp) {
            minTemp = forecastTemps[i];
            minTempIndex = i;
        }
        if (forecastTemps[i] > maxTemp) {
            maxTemp = forecastTemps[i];
            maxTempIndex = i;
        }
    }

    const minTempInt = Math.round(minTemp);
    const maxTempInt = Math.round(maxTemp);

    let earlierExtremumIndex;
    let earlierExtremumTempInt;

    if (minTempIndex <= maxTempIndex) {
        earlierExtremumIndex = minTempIndex;
        earlierExtremumTempInt = minTempInt;
    } else {
        earlierExtremumIndex = maxTempIndex;
        earlierExtremumTempInt = maxTempInt;
    }

    const earlierDiff = Math.abs(earlierExtremumTempInt - currentTempInt);

    let tempExtremumSegment = -1;

    if (earlierDiff >= 3) {
        tempExtremumSegment = earlierExtremumIndex;
    } else {
        const minDiff = Math.abs(minTempInt - currentTempInt);
        const maxDiff = Math.abs(maxTempInt - currentTempInt);

        if (maxDiff >= minDiff) {
            tempExtremumSegment = maxTempIndex;
        } else {
            tempExtremumSegment = minTempIndex;
        }
    }

    const tempReason = tempExtremumSegment === maxTempIndex ? "temp max" : "temp min";

    return { "index": tempExtremumSegment, "reason": tempReason };
}

/**
 * Main function to fetch, process and return weather data.
 */
async function getTabletClockWeather() {
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

// Export the function so it can be used/imported
// If running in a Node environment (for testing here)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getTabletClockWeather };
}
// If running in browser, it will just be a global function.
