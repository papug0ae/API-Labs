(() => {
    const form = document.getElementById("controls");
    const apiKeyInput = document.getElementById("apiKey");
    const cityInput = document.getElementById("city");
    const metricSelect = document.getElementById("metric");
    const startInput = document.getElementById("start");
    const endInput = document.getElementById("end");
    const statusEl = document.getElementById("status");
    const loadBtn = document.getElementById("load");
    const chartCanvas = document.getElementById("temperatureChart");

    const metricConfig = {
        temp: { label: "Температура, °C", accessor: entry => entry.main.temp },
        feels_like: { label: "Ощущается как, °C", accessor: entry => entry.main.feels_like },
        temp_min: { label: "Минимальная температура, °C", accessor: entry => entry.main.temp_min },
        temp_max: { label: "Максимальная температура, °C", accessor: entry => entry.main.temp_max }
    };

    let chartInstance = null;
    let lastForecast = [];

    init();

    function init() {
        restorePreferences();
        setDefaultPeriod();
        form.addEventListener("submit", handleSubmit);
        metricSelect.addEventListener("change", handleQuickUpdate);
        startInput.addEventListener("change", handleQuickUpdate);
        endInput.addEventListener("change", handleQuickUpdate);
    }

    function handleSubmit(event) {
        event.preventDefault();
        const apiKey = apiKeyInput.value.trim();
        const city = cityInput.value.trim();

        if (!apiKey || !city) {
            renderStatus("Введите API ключ и город", true);
            return;
        }

        const queryURL = new URL("https://api.openweathermap.org/data/2.5/forecast");
        queryURL.searchParams.set("q", city);
        queryURL.searchParams.set("appid", apiKey);
        queryURL.searchParams.set("units", "metric");
        queryURL.searchParams.set("lang", "ru");

        renderStatus("Загружаем данные…", false, true);
        toggleForm(true);

        fetch(queryURL)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Ошибка API: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (!Array.isArray(data.list)) {
                    throw new Error("Неожиданный формат ответа OpenWeather");
                }
                lastForecast = data.list;
                persistPreferences(apiKey, city);
                updateChart();
            })
            .catch(error => {
                console.error(error);
                renderStatus(error.message || "Не удалось получить данные", true);
            })
            .finally(() => {
                toggleForm(false);
            });
    }

    function handleQuickUpdate() {
        if (lastForecast.length === 0) {
            return;
        }
        updateChart();
    }

    function updateChart() {
        const metric = metricSelect.value;
        const config = metricConfig[metric];

        if (!config) {
            renderStatus("Неизвестный параметр", true);
            return;
        }

        const startDate = parseLocalDate(startInput.value);
        const endDate = parseLocalDate(endInput.value);

        if (!startDate || !endDate || startDate >= endDate) {
            renderStatus("Проверьте корректность выбранного периода", true);
            return;
        }

        const points = lastForecast
            .filter(entry => {
                const entryDate = new Date(entry.dt * 1000);
                return entryDate >= startDate && entryDate <= endDate;
            })
            .map(entry => ({
                x: entry.dt * 1000,
                y: Number.parseFloat(config.accessor(entry).toFixed(2))
            }));

        if (points.length === 0) {
            renderStatus("На выбранный период нет данных (OpenWeather предоставляет прогноз на 5 дней с шагом 3 часа)", true);
            destroyChart();
            return;
        }

        const datasetLabel = `${config.label} — ${cityInput.value.trim()}`;
        const dataset = {
            label: datasetLabel,
            data: points,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.15)",
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3
        };

        if (!chartInstance) {
            chartInstance = new Chart(chartCanvas, {
                type: "line",
                data: { datasets: [dataset] },
                options: {
                    parsing: false,
                    animation: { duration: 400 },
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: "time",
                            time: {
                                tooltipFormat: "dd.MM.y HH:mm",
                                displayFormats: {
                                    hour: "dd.MM HH:mm",
                                    day: "dd MMM"
                                }
                            },
                            ticks: {
                                maxRotation: 0,
                                autoSkip: true,
                                padding: 6
                            },
                            title: {
                                display: true,
                                text: "Дата и время"
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: "Температура, °C"
                            },
                            ticks: {
                                callback(value) {
                                    return `${value}°`;
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: { display: true },
                        tooltip: {
                            callbacks: {
                                label(context) {
                                    return `${context.dataset.label}: ${context.formattedValue}°C`;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            chartInstance.data.datasets = [dataset];
            chartInstance.update();
        }

        renderStatus(`Получено точек: ${points.length}`, false);
    }

    function destroyChart() {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
    }

    function renderStatus(message, isError = false, isNeutral = false) {
        statusEl.textContent = message;
        if (isNeutral) {
            statusEl.style.color = "#1f2933";
        } else {
            statusEl.style.color = isError ? "#dc2626" : "#047857";
        }
    }

    function toggleForm(isLoading) {
        loadBtn.disabled = isLoading;
        form.querySelectorAll("input, select").forEach(control => {
            control.disabled = isLoading && control !== apiKeyInput;
        });
    }

    function setDefaultPeriod() {
        const now = new Date();
        const end = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
        startInput.value = toInputValue(now);
        endInput.value = toInputValue(end);
    }

    function toInputValue(date) {
        const pad = value => value.toString().padStart(2, "0");
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    function parseLocalDate(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function restorePreferences() {
        try {
            const storedApiKey = localStorage.getItem("ow_apiKey");
            const storedCity = localStorage.getItem("ow_city");
            const storedMetric = localStorage.getItem("ow_metric");
            if (storedApiKey) {
                apiKeyInput.value = storedApiKey;
            }
            if (storedCity) {
                cityInput.value = storedCity;
            }
            if (storedMetric && metricConfig[storedMetric]) {
                metricSelect.value = storedMetric;
            }
        } catch (error) {
            console.warn("Не удалось прочитать настройки", error);
        }
    }

    function persistPreferences(apiKey, city) {
        try {
            localStorage.setItem("ow_apiKey", apiKey);
            localStorage.setItem("ow_city", city);
            localStorage.setItem("ow_metric", metricSelect.value);
        } catch (error) {
            console.warn("Не удалось сохранить настройки", error);
        }
    }
})();
