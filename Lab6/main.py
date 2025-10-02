"""
Lab 6 scaffold for parsing Central Bank of Russia exchange rates.

Complete the TODO sections to export data to CSV and visualize it with matplotlib.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

import requests
from bs4 import BeautifulSoup

CBR_DAILY_URL = "https://www.cbr.ru/scripts/XML_daily.asp"
DEFAULT_CURRENCY = "USD"
DEFAULT_DAYS = 7
CSV_OUTPUT = Path("data") / "currency_rates.csv"
PLOT_OUTPUT = Path("plots") / "currency_rates.png"


@dataclass
class RateSnapshot:
    date: dt.date
    currency: str
    value: float


def fetch_daily_xml(date: dt.date) -> BeautifulSoup:
    params = {"date_req": date.strftime("%d/%m/%Y")}
    response = requests.get(CBR_DAILY_URL, params=params, timeout=10)
    response.raise_for_status()
    response.encoding = "windows-1251"
    return BeautifulSoup(response.text, "xml")


def extract_rate(xml_doc: BeautifulSoup, currency_code: str) -> float:
    node = xml_doc.find("CharCode", string=currency_code.upper())
    if node is None:
        msg = f"Currency {currency_code!r} not found in the XML feed"
        raise ValueError(msg)
    value_node = node.find_parent("Valute").find("Value")
    nominal_node = node.find_parent("Valute").find("Nominal")
    value = float(value_node.text.replace(",", "."))
    nominal = float(nominal_node.text.replace(",", "."))
    return value / nominal


def collect_series(
    start_date: dt.date,
    days: int = DEFAULT_DAYS,
    currency_code: str = DEFAULT_CURRENCY,
) -> List[RateSnapshot]:
    snapshots: List[RateSnapshot] = []
    for offset in range(days):
        current_date = start_date + dt.timedelta(days=offset)
        xml_doc = fetch_daily_xml(current_date)
        try:
            rate_value = extract_rate(xml_doc, currency_code)
        except ValueError:
            continue
        snapshots.append(
            RateSnapshot(
                date=current_date,
                currency=currency_code.upper(),
                value=rate_value,
            )
        )
    return snapshots


def ensure_directories() -> None:
    for path in (CSV_OUTPUT.parent, PLOT_OUTPUT.parent):
        path.mkdir(parents=True, exist_ok=True)


def export_to_csv(records: Iterable[RateSnapshot], destination: Path = CSV_OUTPUT) -> None:
    """TODO: build a pandas.DataFrame from records and write it to CSV."""
    raise NotImplementedError("Implement CSV export with pandas")


def plot_rates(records: Iterable[RateSnapshot], destination: Path = PLOT_OUTPUT) -> None:
    """TODO: create a matplotlib line chart from records and save it to PNG."""
    raise NotImplementedError("Implement plotting with matplotlib")


def preview(records: Iterable[RateSnapshot]) -> None:
    for snap in records:
        print(f"{snap.date.isoformat()} | {snap.currency}: {snap.value:.4f}")


if __name__ == "__main__":
    today = dt.date.today()
    series = collect_series(
        start_date=today - dt.timedelta(days=DEFAULT_DAYS - 1),
        days=DEFAULT_DAYS,
        currency_code=DEFAULT_CURRENCY,
    )
    ensure_directories()
    preview(series)
    # TODO: once export_to_csv is implemented, uncomment the call below.
    # export_to_csv(series)
    # TODO: once plot_rates is implemented, uncomment the call below.
    # plot_rates(series)
