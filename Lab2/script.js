(() => {
  const API_ENDPOINT = "https://images-api.nasa.gov/search";
  const MAX_RESULTS = 40;

  const form = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  const mediaTypeSelect = document.getElementById("media-type");
  const yearInput = document.getElementById("year");
  const resultsContainer = document.getElementById("results");
  const statusElement = document.getElementById("status");

  let activeController = null;

  const formatDate = (rawValue) => {
    if (!rawValue) {
      return "";
    }

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const truncate = (text, limit = 200) => {
    if (!text) {
      return "Описание отсутствует";
    }

    if (text.length <= limit) {
      return text;
    }

    return `${text.slice(0, limit - 1).trim()}...`;
  };

  const buildQuery = (query, mediaType, year) => {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("page", "1");
    params.set("media_type", mediaType === "all" ? "image,video" : mediaType);

    if (year) {
      params.set("year_start", year);
      params.set("year_end", year);
    }

    return `${API_ENDPOINT}?${params.toString()}`;
  };

  const clearResults = () => {
    resultsContainer.innerHTML = "";
  };

  const renderItems = (items) => {
    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
      const meta = Array.isArray(item.data) ? item.data[0] : null;

      if (!meta) {
        return;
      }

      const card = createCard(meta, item);
      if (card) {
        fragment.appendChild(card);
      }
    });

    resultsContainer.appendChild(fragment);
  };

  const createCard = (meta, item) => {
    const title = meta.title || "Без названия";
    const description = truncate(meta.description);
    const mediaType = meta.media_type || "image";
    const date = formatDate(meta.date_created);
    const nasaId = meta.nasa_id || "";

    const links = Array.isArray(item.links) ? item.links : [];
    const previewLink = links.find((link) => link.render === "image") || links[0];
    const previewUrl = previewLink ? previewLink.href : "";
    const detailsUrl = nasaId ? `https://images.nasa.gov/details-${nasaId}` : previewUrl;

    const card = document.createElement("article");
    card.className = "media-card";

    const preview = document.createElement("a");
    preview.className = "media-card__preview";
    preview.href = mediaType === "video" ? detailsUrl : previewUrl || detailsUrl;
    preview.target = "_blank";
    preview.rel = "noopener noreferrer";
    preview.setAttribute("aria-label", `Открыть ${mediaType === "video" ? "видео" : "изображение"} ${title}`);

    if (previewUrl) {
      const img = document.createElement("img");
      img.src = previewUrl;
      img.alt = title;
      preview.appendChild(img);
    } else {
      preview.textContent = "Открыть медиа";
    }

    if (mediaType === "video") {
      const badge = document.createElement("span");
      badge.className = "media-card__badge";
      badge.textContent = "Видео";
      preview.appendChild(badge);
    }

    const content = document.createElement("div");
    content.className = "media-card__content";

    const heading = document.createElement("h3");
    heading.textContent = title;
    content.appendChild(heading);

    if (date) {
      const metaInfo = document.createElement("p");
      metaInfo.className = "media-card__meta";
      metaInfo.textContent = date;
      content.appendChild(metaInfo);
    }

    const descriptionElement = document.createElement("p");
    descriptionElement.className = "media-card__description";
    descriptionElement.textContent = description;
    content.appendChild(descriptionElement);

    const actions = document.createElement("div");
    actions.className = "media-card__actions";

    const detailsLink = document.createElement("a");
    detailsLink.href = detailsUrl;
    detailsLink.target = "_blank";
    detailsLink.rel = "noopener noreferrer";
    detailsLink.textContent = mediaType === "video" ? "Смотреть на сайте NASA" : "Открыть в полном размере";
    actions.appendChild(detailsLink);
    content.appendChild(actions);

    card.appendChild(preview);
    card.appendChild(content);

    return card;
  };

  const handleError = (error) => {
    if (error.name === "AbortError") {
      return;
    }

    // Сообщаем пользователю об ошибке и остаёмся в консоли для отладки.
    statusElement.textContent = "Не удалось получить данные. Попробуйте позже.";
    console.error("NASA API request failed", error);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const query = searchInput.value.trim();
    const mediaType = mediaTypeSelect.value;
    const rawYear = yearInput.value.trim();

    if (!query) {
      statusElement.textContent = "Введите поисковый запрос.";
      return;
    }

    let year = "";
    if (rawYear) {
      const parsedYear = parseInt(rawYear, 10);
      if (Number.isNaN(parsedYear) || parsedYear < 1920 || parsedYear > 2100) {
        statusElement.textContent = "Введите корректный год в диапазоне 1920–2100.";
        yearInput.focus();
        return;
      }
      year = String(parsedYear);
    }

    if (activeController) {
      activeController.abort();
    }

    activeController = new AbortController();

    statusElement.textContent = "Загрузка...";
    clearResults();

    try {
      const response = await fetch(buildQuery(query, mediaType, year), {
        signal: activeController.signal,
      });

      if (!response.ok) {
        throw new Error(`Unexpected response ${response.status}`);
      }

      const payload = await response.json();
      const collection = payload && payload.collection ? payload.collection : null;
      const items = collection && Array.isArray(collection.items) ? collection.items : [];
      const total = collection && collection.metadata ? collection.metadata.total_hits : items.length;

      if (!items.length) {
        statusElement.textContent = "Ничего не найдено. Попробуйте изменить запрос.";
        return;
      }

      statusElement.textContent = `Найдено результатов: ${total}`;
      renderItems(items.slice(0, MAX_RESULTS));
    } catch (error) {
      handleError(error);
    }
  };

  form.addEventListener("submit", handleSubmit);

  // Устанавливаем фокус на поле ввода при загрузке страницы.
  window.addEventListener("DOMContentLoaded", () => {
    searchInput.focus();
  });
})();

