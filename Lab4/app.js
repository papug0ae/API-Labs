(() => {
  const form = document.getElementById('analysis-form');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const messageEl = document.getElementById('message');
  const sentimentScoreEl = document.getElementById('sentimentScore');
  const sentimentConfidenceEl = document.getElementById('sentimentConfidence');
  const positiveRatioEl = document.getElementById('positiveRatio');
  const negativeRatioEl = document.getElementById('negativeRatio');
  const keywordsTableBody = document.querySelector('#keywordsTable tbody');
  const statsCells = {
    charCount: document.getElementById('charCount'),
    charCountNoSpaces: document.getElementById('charCountNoSpaces'),
    wordCount: document.getElementById('wordCount'),
    sentenceCount: document.getElementById('sentenceCount'),
    avgWordLength: document.getElementById('avgWordLength'),
    readingTime: document.getElementById('readingTime')
  };

  const RAPIDAPI_HOSTS = {
    sentiment: 'twinword-sentiment-analysis.p.rapidapi.com',
    keywords: 'twinword-keyword-extractor.p.rapidapi.com'
  };

  let sentimentChart;
  let keywordsChart;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const apiKey = form.apiKey.value.trim();
    const text = form.text.value.trim();

    if (!text) {
      showMessage('Введите текст для анализа.', true);
      return;
    }

    if (!apiKey) {
      showMessage('Укажите RapidAPI ключ, чтобы выполнить запрос.', true);
      return;
    }

    toggleLoading(true);
    showMessage('Выполняется анализ текста…');

    try {
      const [sentimentData, keywordData] = await Promise.all([
        fetchSentiment({ apiKey, text }),
        fetchKeywords({ apiKey, text })
      ]);

      renderSentiment(sentimentData);
      renderKeywords(keywordData);
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
    positiveRatioEl.textContent = '—';
    negativeRatioEl.textContent = '—';
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

  async function fetchSentiment({ apiKey, text }) {
    const body = new URLSearchParams({ text });

    const response = await fetch(`https://${RAPIDAPI_HOSTS.sentiment}/analyze/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOSTS.sentiment
      },
      body: body.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Ошибка запроса: ${response.status}`);
    }

    if (data.result_code && data.result_code !== '200') {
      throw new Error(data.result_msg || 'Twinword вернуло ошибку анализа тональности.');
    }

    return data;
  }

  async function fetchKeywords({ apiKey, text }) {
    const body = new URLSearchParams({ text });

    const response = await fetch(`https://${RAPIDAPI_HOSTS.keywords}/extract/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOSTS.keywords
      },
      body: body.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Ошибка запроса: ${response.status}`);
    }

    if (data.result_code && data.result_code !== '200') {
      throw new Error(data.result_msg || 'Не удалось извлечь ключевые слова.');
    }

    return data;
  }

  function renderSentiment(data) {
    const label = mapSentimentLabel(data.sentiment);
    const scoreValue = clampScore(data.score);

    sentimentScoreEl.textContent = label;
    sentimentConfidenceEl.textContent = formatConfidence(data.score);
    positiveRatioEl.textContent = formatRatio(data.ratio?.positive);
    negativeRatioEl.textContent = formatRatio(data.ratio?.negative);

    const ctx = document.getElementById('sentimentChart').getContext('2d');
    const chartData = {
      labels: ['Twinword score'],
      datasets: [
        {
          label: 'Score (-1…1)',
          data: [scoreValue],
          backgroundColor: [scoreValue >= 0 ? 'rgba(94, 234, 212, 0.7)' : 'rgba(248, 113, 113, 0.7)'],
          borderColor: [scoreValue >= 0 ? 'rgba(94, 234, 212, 1)' : 'rgba(248, 113, 113, 1)'],
          borderWidth: 1.5
        }
      ]
    };

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
            min: -1,
            max: 1,
            ticks: {
              stepSize: 0.5,
              color: '#cbd5f5',
              callback(value) {
                return value;
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
                return `Score: ${context.parsed.y}`;
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
        const weight = Number.isFinite(item.weight) ? item.weight.toFixed(3) : '—';
        return `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${item.source}</td>
          <td>${weight}</td>
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
            label: 'Вес ключевого слова',
            data: topKeywords.map((item) => item.weight),
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
            ticks: { color: '#cbd5f5' },
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
    const keywordMap = data.keyword || {};
    return Object.entries(keywordMap)
      .map(([label, weight]) => ({
        label,
        weight: Number(weight) || 0,
        source: 'Twinword'
      }))
      .filter((item) => item.label)
      .sort((a, b) => b.weight - a.weight);
  }

  function mapSentimentLabel(sentiment) {
    const mapping = {
      positive: 'Положительная',
      neutral: 'Нейтральная',
      negative: 'Отрицательная'
    };
    return mapping[sentiment] || 'Нет данных';
  }

  function clampScore(score) {
    if (typeof score !== 'number' || Number.isNaN(score)) {
      return 0;
    }
    return Math.max(-1, Math.min(1, score));
  }

  function formatConfidence(score) {
    if (typeof score !== 'number' || Number.isNaN(score)) {
      return '—';
    }
    return `${Math.round(Math.abs(score) * 100)}%`;
  }

  function formatRatio(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }
    return `${(value * 100).toFixed(1)}%`;
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
