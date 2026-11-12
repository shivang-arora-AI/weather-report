// WAQI Ground Station Token
const WAQI_TOKEN = "c42bd1d561a6d4e62e8f20118ccb21cc970e02e0";

let chartInstance = null;
let searchDebounceTimeout = null;

// DOM Elements
const locationNameEl = document.getElementById("location-name");
const currentTimeEl = document.getElementById("current-time");
const weatherIconEl = document.getElementById("weather-icon");
const currentTempEl = document.getElementById("current-temp");
const weatherDescEl = document.getElementById("weather-desc");
const windSpeedEl = document.getElementById("wind-speed");
const humidityEl = document.getElementById("humidity");
const pressureEl = document.getElementById("pressure");

const aqiValEl = document.getElementById("aqi-val");
const aqiBadgeEl = document.getElementById("aqi-badge");
const aqiAdviceEl = document.getElementById("aqi-advice");
const pm25El = document.getElementById("pm25");
const pm10El = document.getElementById("pm10");
const no2El = document.getElementById("no2");
const o3El = document.getElementById("o3");

const forecastList = document.getElementById("forecast-list");
const citySearch = document.getElementById("city-search");
const searchResults = document.getElementById("search-results");
const geoBtn = document.getElementById("geo-btn");

// Weather Code Interpretation (WMO codes to human readable + icon)
function interpretWeatherCode(code) {
  const map = {
    0: { desc: "Clear Sky", icon: "☀️" },
    1: { desc: "Mainly Clear", icon: "🌤️" },
    2: { desc: "Partly Cloudy", icon: "⛅" },
    3: { desc: "Overcast", icon: "☁️" },
    45: { desc: "Fog", icon: "🌫️" },
    48: { desc: "Depositing Rime Fog", icon: "🌫️" },
    51: { desc: "Light Drizzle", icon: "🌦️" },
    53: { desc: "Moderate Drizzle", icon: "🌧️" },
    61: { desc: "Slight Rain", icon: "🌧️" },
    63: { desc: "Moderate Rain", icon: "🌧️" },
    65: { desc: "Heavy Rain", icon: "⛈️" },
    71: { desc: "Slight Snow Fall", icon: "🌨️" },
    73: { desc: "Moderate Snow", icon: "❄️" },
    80: { desc: "Rain Showers", icon: "🌦️" },
    95: { desc: "Thunderstorm", icon: "⛈️" }
  };
  return map[code] || { desc: "Partly Cloudy", icon: "⛅" };
}

// Indian CPCB AQI Categories & Health Advisory
function getIndianAqiInfo(aqi) {
  if (aqi <= 50) {
    return { label: "Good", color: "#10b981", advice: "Minimal health impact. Air quality is clean." };
  } else if (aqi <= 100) {
    return { label: "Satisfactory", color: "#84cc16", advice: "Minor breathing discomfort to sensitive individuals." };
  } else if (aqi <= 200) {
    return { label: "Moderate", color: "#f59e0b", advice: "Breathing discomfort to people with asthma or heart conditions." };
  } else if (aqi <= 300) {
    return { label: "Poor", color: "#f97316", advice: "Breathing discomfort to most people on prolonged outdoor exposure." };
  } else if (aqi <= 400) {
    return { label: "Very Poor", color: "#ef4444", advice: "Respiratory illness likelihood high. Limit outdoor exposure." };
  } else {
    return { label: "Severe", color: "#7f1d1d", advice: "Health emergency alert. Keep windows closed and avoid outdoor activities." };
  }
}

// Fetch Real-Time Ground Monitoring Station AQI via WAQI
async function fetchRealGroundAQI(lat, lon) {
  try {
    const url = `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${WAQI_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "ok") {
      throw new Error("Ground station data not found");
    }

    const station = data.data;
    const aqi = station.aqi;
    const iaqi = station.iaqi || {};
    const stationName = station.city && station.city.name ? station.city.name.split(",")[0] : "Local Station";

    // Set AQI numerical display & badge
    aqiValEl.textContent = aqi;
    const info = getIndianAqiInfo(aqi);

    aqiBadgeEl.textContent = info.label;
    aqiBadgeEl.style.backgroundColor = `${info.color}25`;
    aqiBadgeEl.style.color = info.color;
    aqiAdviceEl.textContent = `${info.advice} (Station: ${stationName})`;

    // Populate individual pollutants recorded by ground sensors
    pm25El.textContent = iaqi.pm25 ? `${Math.round(iaqi.pm25.v)} µg/m³` : "--";
    pm10El.textContent = iaqi.pm10 ? `${Math.round(iaqi.pm10.v)} µg/m³` : "--";
    no2El.textContent = iaqi.no2 ? `${Math.round(iaqi.no2.v)} µg/m³` : "--";
    o3El.textContent = iaqi.o3 ? `${Math.round(iaqi.o3.v)} µg/m³` : "--";

  } catch (err) {
    console.warn("Could not retrieve real ground AQI:", err);
    aqiValEl.textContent = "--";
    aqiBadgeEl.textContent = "Unavailable";
    aqiAdviceEl.textContent = "Nearby ground sensor data unavailable.";
  }
}

// Fetch Weather & Air Quality
async function fetchWeatherData(lat, lon, cityName) {
  try {
    locationNameEl.textContent = cityName;
    currentTimeEl.textContent = new Date().toLocaleString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "auto";

    // 1. Fetch live meteorological data from Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,weather_code&hourly=temperature_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(userTimezone)}`;
    
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) throw new Error("Failed to load weather data");

    const weatherData = await weatherRes.json();

    updateCurrentWeather(weatherData.current);
    updateHourlyChart(weatherData.hourly);
    update7DayForecast(weatherData.daily);

    // 2. Fetch live physical sensor AQI data
    fetchRealGroundAQI(lat, lon);

  } catch (err) {
    console.error("Meteorological data failure:", err);
    weatherDescEl.textContent = "Error fetching live weather conditions.";
  }
}

// Update Current Temperature & Atmospheric stats
function updateCurrentWeather(current) {
  currentTempEl.textContent = Math.round(current.temperature_2m);
  const condition = interpretWeatherCode(current.weather_code);
  weatherDescEl.textContent = condition.desc;
  weatherIconEl.textContent = condition.icon;

  windSpeedEl.textContent = `${current.wind_speed_10m} km/h`;
  humidityEl.textContent = `${current.relative_humidity_2m}%`;
  pressureEl.textContent = `${Math.round(current.surface_pressure)} hPa`;
}

// Render 24-Hour Line Chart with Chart.js
function updateHourlyChart(hourly) {
  const ctx = document.getElementById("tempChart").getContext("2d");
  
  const labels = hourly.time.slice(0, 24).map(t => t.split("T")[1]);
  const temps = hourly.temperature_2m.slice(0, 24);

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Temperature (°C)",
        data: temps,
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.12)",
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f8fafc",
          bodyColor: "#38bdf8",
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8", maxTicksLimit: 8 }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8" }
        }
      }
    }
  });
}

// Update 7-Day Forecast Matrix
function update7DayForecast(daily) {
  forecastList.innerHTML = "";

  daily.time.forEach((dateStr, index) => {
    const d = new Date(dateStr);
    const dayName = index === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" });
    const condition = interpretWeatherCode(daily.weather_code[index]);
    const max = Math.round(daily.temperature_2m_max[index]);
    const min = Math.round(daily.temperature_2m_min[index]);

    const li = document.createElement("li");
    li.className = "forecast-row";
    li.innerHTML = `
      <span class="forecast-day">${dayName}</span>
      <div class="forecast-condition">
        <span>${condition.icon}</span>
        <span>${condition.desc}</span>
      </div>
      <div class="forecast-temps">
        <span>${max}°</span>
        <span class="min-temp">${min}°</span>
      </div>
    `;
    forecastList.appendChild(li);
  });
}

// City Search Autocomplete via Open-Meteo Geocoding
citySearch.addEventListener("input", (e) => {
  clearTimeout(searchDebounceTimeout);
  const query = e.target.value.trim();

  if (query.length < 2) {
    searchResults.classList.add("hidden");
    return;
  }

  searchDebounceTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        searchResults.innerHTML = `<li>No cities found</li>`;
        searchResults.classList.remove("hidden");
        return;
      }

      searchResults.innerHTML = "";
      data.results.forEach((place) => {
        const li = document.createElement("li");
        const country = place.country ? `, ${place.country}` : "";
        const admin = place.admin1 ? ` (${place.admin1})` : "";
        li.textContent = `${place.name}${admin}${country}`;

        li.addEventListener("click", () => {
          fetchWeatherData(place.latitude, place.longitude, `${place.name}${country}`);
          citySearch.value = "";
          searchResults.classList.add("hidden");
        });

        searchResults.appendChild(li);
      });

      searchResults.classList.remove("hidden");
    } catch (err) {
      console.error("Geocoding lookup error:", err);
    }
  }, 300);
});

// Close search dropdown on click outside
document.addEventListener("click", (e) => {
  if (!citySearch.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.classList.add("hidden");
  }
});

// Geolocation Handler
function requestLocation() {
  if (!navigator.geolocation) {
    fetchWeatherData(28.6139, 77.2090, "New Delhi, India");
    return;
  }

  locationNameEl.textContent = "Locating...";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      
      try {
        const revRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        const revData = await revRes.json();
        const city = revData.city || revData.locality || revData.principalSubdivision || "Your Area";
        const country = revData.countryName ? `, ${revData.countryName}` : "";
        fetchWeatherData(lat, lon, `${city}${country}`);
      } catch {
        fetchWeatherData(lat, lon, "Local Weather");
      }
    },
    (err) => {
      console.warn("Location permission denied or unavailable:", err.message);
      fetchWeatherData(28.6139, 77.2090, "New Delhi, India");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

geoBtn.addEventListener("click", requestLocation);

// Initial Load
requestLocation();