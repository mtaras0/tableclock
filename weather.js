// Path to the local weather data file
const weatherDataUrl = 'weatherData.json';

async function updateWeather() {
    try {
        // Add a cache-busting query parameter to prevent stale data
        const response = await fetch(`${weatherDataUrl}?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Update weather-now elements
        const nowTemp = data.now.temp;
        const nowIcon = data.now.icon;
        const nowTempElement = document.getElementById('weather-temp-now');
        const nowIconElement = document.getElementById('weather-icon-now');

        let formattedNowTemp = `${nowTemp}°`;
        if (data.now.uvi >= 8) {
            formattedNowTemp = `!${formattedNowTemp}`;
        }
        nowTempElement.textContent = formattedNowTemp;
        nowIconElement.innerHTML = '';
        const nowImg = document.createElement('img');
        nowImg.src = `icons/${nowIcon}`;
        nowIconElement.appendChild(nowImg);

        // Update weather-interval elements
        // const intervalDesc = data.interval.desc;
        // const intervalTime = data.interval.time;
        // const intervalDescElement = document.getElementById('weather-interval-desc');
        // const intervalTimeElement = document.getElementById('weather-interval-time');

        // intervalDescElement.innerHTML = intervalDesc;
        // intervalTimeElement.innerHTML = intervalTime;

        const nextLine = data.next;
        const nextLineElement = document.getElementById('weather-next');
        nextLineElement.innerHTML = nextLine

    } catch (error) {
        console.error('Error fetching or processing local weather data:', error);
    }
}

// Note: The periodic update logic (setInterval) is handled in script.js
// Ensure script.js calls updateWeather periodically.