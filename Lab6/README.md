# Lab 6 Implementation

Currency rate scraper for the Central Bank of Russia that stores data to CSV and renders a line chart.

## Features
- fetches daily rates from the CBR `XML_daily.asp` endpoint;
- extracts the desired currency (USD by default) while respecting the published nominal;
- collects a multi-day time series and prints a console preview;
- writes the results to `data/currency_rates.csv` and saves the chart to `plots/currency_rates.png`;
- provides an interactive CLI and optional command-line arguments.

## Setup
```bash
pip install -r requirements.txt
```

## Usage
### Interactive mode (default)
```bash
python main.py
```
Answer the prompts to change currency, day count, or start date. Press Enter to keep defaults or type `q` to exit.

### Non-interactive run
```bash
python main.py --no-prompt [--currency EUR] [--days 10] [--start-date 2025-09-01]
```
Arguments:
- `--currency` - three-letter ISO code;
- `--days` - number of days (1-31);
- `--start-date` - starting date in `YYYY-MM-DD` format.

After the run the script updates both CSV and PNG files and prints their locations.
