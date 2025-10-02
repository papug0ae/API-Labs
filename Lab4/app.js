(() => {
  const form = document.getElementById('analysis-form');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const messageEl = document.getElementById('message');
  const sentimentScoreEl = document.getElementById('sentimentScore');
  const sentimentConfidenceEl = document.getElementById('sentimentConfidence');
  const subjectivityEl = document.getElementById('subjectivity');
  const ironyEl = document.getElementById('irony');
  const keywordsTableBody = document.querySelector('#keywordsTable tbody');
  const statsCells = {
    charCount: document.getElementById('charCount'),
    charCountNoSpaces: document.getElementById('charCountNoSpaces'),
    wordCount: document.getElementById('wordCount'),
    sentenceCount: document.getElementById('sentenceCount'),
    avgWordLength: document.getElementById('avgWordLength'),
    readingTime: document.getElementById('readingTime')
  };

  let sentimentChart;
  let keywordsChart;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const apiKey = form.apiKey.value.trim();
    const language = form.language.value;
    const text = form.text.value.trim();

    if (!text) {
      showMessage('Введите текст для анализа.', true);
      return;
    }

    if (!apiKey) {
      showMessage('Укажите ключ MeaningCloud, чтобы выполнить запрос.', true);
      return;
    }

    toggleLoading(true);
    showMessage('Выполняется анализ текста…');

    try {
      const [sentimentData, topicsData] = await Promise.all([
        fetchSentiment({ apiKey, language, text }),
        fetchTopics({ apiKey, language, text })
      ]);

      renderSentiment(sentimentData);
      renderKeywords(topicsData);
      renderStats(text);
      showMessage('Анализ завершён успешно.');
    } catch (error) {
      console.error(error);
      showMessage(error.message || 'Не удалось выполнить анализ. Попробуйте позже.', true);
    } finally {
      toggleLoading(false);
    }
  });

  form.addEventListener('reset', () => {
    showMessage('');
    sentimentScoreEl.textContent = '—';
    sentimentConfidenceEl.textContent = '—';
    subjectivityEl.textContent = '—';
    ironyEl.textContent = '—';
    keywordsTableBody.innerHTML = '<tr><td colspan="3" class="placeholder">Результаты появятся после анализа</td></tr>';
    Object.values(statsCells).forEach((cell) => {
      cell.textContent = '—';
    });

    if (sentimentChart) {
      sentimentChart.destroy();
      sentimentChart = null;
    }

    if (keywordsChart) {
      keywordsChart.destroy();
      keywordsChart = null;
    }
  });

  function toggleLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    analyzeBtn.textContent = isLoading ? 'Анализ…' : 'Анализировать';
  }

  function showMessage(text, isError = false) {
    messageEl.textContent = text;
    messageEl.classList.toggle('message--error', Boolean(isError));
  }

  async function fetchSentiment({ apiKey, language, text }) {
    const params = new URLSearchParams({
      key: apiKey,
      lang: language,
      txt: text,
      model: 'general'
    });

    const response = await fetch('https://api.meaningcloud.com/sentiment-2.1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.status?.msg || `Ошибка запроса: ${response.status}`);
    }

    if (data.status?.code && data.status.code !== '0') {
      throw new Error(data.status.msg || 'API MeaningCloud вернуло ошибку.');
    }

    return data;
  }

  async function fetchTopics({ apiKey, language, text }) {
    const params = new URLSearchParams({
      key: apiKey,
      lang: language,
      txt: text,
      tt: 'a',
      max: '20'
    });

    const response = await fetch('https://api.meaningcloud.com/topics-2.0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.status?.msg || `Ошибка запроса: ${response.status}`);
    }

    if (data.status?.code && data.status.code !== '0') {
      throw new Error(data.status.msg || 'Не удалось извлечь ключевые слова.');
    }

    return data;
  }

  function renderSentiment(data) {
    const scoreTag = data.score_tag;
    const label = mapScoreTagToLabel(scoreTag);
    sentimentScoreEl.textContent = label;
    sentimentConfidenceEl.textContent = formatConfidence(data.confidence);
    subjectivityEl.textContent = mapSubjectivity(data.subjectivity);
    ironyEl.textContent = mapIrony(data.irony);

    const scoreValue = mapScoreTagToValue(scoreTag);
    const chartData = {
      labels: ['Тональность текста'],
      datasets: [
        {
          label: 'Отрицательная ← нейтральная → положительная',
          data: [scoreValue],
          backgroundColor: [scoreValue >= 0 ? 'rgba(94, 234, 212, 0.7)' : 'rgba(248, 113, 113, 0.7)'],
          borderColor: [scoreValue >= 0 ? 'rgba(94, 234, 212, 1)' : 'rgba(248, 113, 113, 1)'],
          borderWidth: 1.5
        }
      ]
    };

    const ctx = document.getElementById('sentimentChart').getContext('2d');
    if (sentimentChart) {
      sentimentChart.destroy();
    }

    sentimentChart = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        scales: {
          x: {
            ticks: { color: '#cbd5f5' },
            grid: { color: 'rgba(148, 163, 184, 0.2)' }
          },
          y: {
            min: -2,
            max: 2,
            ticks: {
              stepSize: 1,
              color: '#cbd5f5',
              callback: (value) => {
                switch (value) {
                  case -2:
                    return 'Сильно отриц.';
                  case -1:
                    return 'Отриц.';
                  case 0:
                    return 'Нейтр.';
                  case 1:
                    return 'Полож.';
                  case 2:
                    return 'Сильно полож.';
                  default:
                    return value;
                }
              }
            },
            grid: { color: 'rgba(148, 163, 184, 0.2)' }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${mapValueToDescription(context.parsed.y)}`;
              }
            }
          }
        }
      }
    });
  }

  function renderKeywords(data) {
    const keywords = extractKeywords(data);

    if (!keywords.length) {
      keywordsTableBody.innerHTML = '<tr><td colspan="3" class="placeholder">API не вернуло ключевые слова для данного текста.</td></tr>';
      if (keywordsChart) {
        keywordsChart.destroy();
        keywordsChart = null;
      }
      return;
    }

    keywordsTableBody.innerHTML = keywords
      .map((item) => {
        const relevance = Number.isFinite(item.relevance) ? item.relevance.toFixed(2) : '—';
        return `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${escapeHtml(item.source)}</td>
          <td>${relevance}</td>
        </tr>`;
      })
      .join('');

    const topKeywords = keywords.slice(0, 7);
    const ctx = document.getElementById('keywordsChart').getContext('2d');

    if (keywordsChart) {
      keywordsChart.destroy();
    }

    keywordsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topKeywords.map((item) => item.label),
        datasets: [
          {
            label: 'Релевантность (0-1)',
            data: topKeywords.map((item) => item.relevance),
            backgroundColor: 'rgba(99, 102, 241, 0.7)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        scales: {
          x: {
            min: 0,
            max: 1,
            ticks: { color: '#cbd5f5', stepSize: 0.2 },
            grid: { color: 'rgba(148, 163, 184, 0.2)' }
          },
          y: {
            ticks: { color: '#cbd5f5' },
            grid: { color: 'rgba(148, 163, 184, 0.2)' }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }

  function renderStats(text) {
    const stats = computeStats(text);
    statsCells.charCount.textContent = stats.charCount;
    statsCells.charCountNoSpaces.textContent = stats.charCountNoSpaces;
    statsCells.wordCount.textContent = stats.wordCount;
    statsCells.sentenceCount.textContent = stats.sentenceCount;
    statsCells.avgWordLength.textContent = stats.avgWordLength.toFixed(2);
    statsCells.readingTime.textContent = `${stats.readingMinutes.toFixed(1)} мин (≈${stats.readingSeconds} с)`;
  }

  function computeStats(text) {
    const charCount = text.length;
    const charCountNoSpaces = text.replace(/\s+/g, '').length;
    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const sentenceCount = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length;
    const avgWordLength = wordCount ? charCountNoSpaces / wordCount : 0;
    const readingMinutes = wordCount ? wordCount / 200 : 0;
    const readingSeconds = Math.max(5, Math.round(readingMinutes * 60));

    return {
      charCount,
      charCountNoSpaces,
      wordCount,
      sentenceCount,
      avgWordLength,
      readingMinutes,
      readingSeconds
    };
  }

  function extractKeywords(data) {
    const concepts = (data.concept_list || []).map((item) => ({
      label: item.form,
      source: 'Concept',
      relevance: Number(item.relevance) || 0
    }));

    const entities = (data.entity_list || []).map((item) => ({
      label: item.form,
      source: item.sementity?.type || 'Entity',
      relevance: Number(item.relevance) || 0
    }));

    return [...concepts, ...entities]
      .filter((item) => item.label)
      .sort((a, b) => b.relevance - a.relevance);
  }

  function mapScoreTagToLabel(scoreTag) {
    const mapping = {
      'P+': 'Сильноположительная',
      P: 'Положительная',
      NEU: 'Нейтральная',
      N: 'Отрицательная',
      'N+': 'Сильноотрицательная',
      NONE: 'Нет тональности'
    };
    return mapping[scoreTag] || 'Нет данных';
  }

  function mapScoreTagToValue(scoreTag) {
    const mapping = {
      'P+': 2,
      P: 1,
      NEU: 0,
      N: -1,
      'N+': -2,
      NONE: 0
    };
    return mapping[scoreTag] ?? 0;
  }

  function mapValueToDescription(value) {
    switch (value) {
      case -2:
        return 'Сильно отрицательная тональность';
      case -1:
        return 'Отрицательная тональность';
      case 0:
        return 'Нейтральная тональность';
      case 1:
        return 'Положительная тональность';
      case 2:
        return 'Сильноположительная тональность';
      default:
        return `${value}`;
    }
  }

  function mapSubjectivity(subjectivity) {
    const mapping = {
      SUBJECTIVE: 'Субъективный текст',
      OBJECTIVE: 'Объективный текст'
    };
    return mapping[subjectivity] || 'Нет данных';
  }

  function mapIrony(irony) {
    const mapping = {
      NONIRONIC: 'Без иронии',
      IRONIC: 'Есть признаки иронии'
    };
    return mapping[irony] || 'Нет данных';
  }

  function formatConfidence(confidence) {
    if (confidence === undefined || confidence === null) {
      return '—';
    }
    const value = Number(confidence);
    if (Number.isNaN(value)) {
      return '—';
    }
    return `${value}%`;
  }

  function escapeHtml(text) {
    const safe = String(text ?? '');
    return safe.replace(/[&<>"']/g, (char) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[char] || char;
    });
  }
})();
