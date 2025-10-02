from __future__ import annotations

import argparse
import datetime as dt
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

import requests
from bs4 import BeautifulSoup

import pandas as pd
import matplotlib.pyplot as plt

CBR_DAILY_URL = "https://www.cbr.ru/scripts/XML_daily.asp"
DEFAULT_CURRENCY = "USD"
DEFAULT_DAYS = 7
MAX_DAYS = 31
CSV_OUTPUT = Path("data") / "currency_rates.csv"
PLOT_OUTPUT = Path("plots") / "currency_rates.png"
EXIT_KEYWORDS = {"exit", "quit", "q"}


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


def resolve_start_date(days: int, explicit_start: Optional[dt.date] = None) -> dt.date:
    """Return the start date to use given days range and optional explicit value."""
    if explicit_start is not None:
        return explicit_start
    today = dt.date.today()
    span = max(days, 1) - 1
    return today - dt.timedelta(days=span)


def try_parse_date(value: str) -> Optional[dt.date]:
    """Parse YYYY-MM-DD string into a date or return None if invalid."""
    try:
        return dt.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def validate_days(value: int) -> int:
    """Validate day range constraints."""
    if value < 1 or value > MAX_DAYS:
        raise ValueError(f"Days count must be within 1..{MAX_DAYS}")
    return value


def prompt_input(message: str) -> str:
    """Read input and abort with KeyboardInterrupt if user wants to quit."""
    raw = input(message).strip()
    if raw.lower() in EXIT_KEYWORDS:
        raise KeyboardInterrupt
    return raw


def prompt_currency(default: str) -> str:
    """Ask user for 3-letter currency code with default fallback."""
    default = default.upper()
    while True:
        raw = prompt_input(f"Currency code (3 letters) [{default}]: ")
        if not raw:
            return default
        if len(raw) == 3 and raw.isalpha():
            return raw.upper()
        print("Enter a three-letter currency code such as USD. Type 'q' to exit.")


def prompt_days(default: int) -> int:
    """Ask user for number of days in valid range."""
    default = validate_days(default)
    while True:
        raw = prompt_input(f"Number of days (1-{MAX_DAYS}) [{default}]: ")
        if not raw:
            return default
        if raw.isdigit():
            value = int(raw)
            try:
                return validate_days(value)
            except ValueError as exc:
                print(exc)
                continue
        print(f"Enter an integer from 1 to {MAX_DAYS}. Type 'q' to exit.")


def prompt_start_date(default_days: int, preset: Optional[dt.date] = None) -> dt.date:
    """Ask user for start date or keep automatically calculated value."""
    auto_date = resolve_start_date(default_days, preset)
    while True:
        raw = prompt_input(
            f"Start date (YYYY-MM-DD) [{auto_date.isoformat()} or 'auto']: ")
        if not raw or raw.lower() == 'auto':
            return auto_date
        candidate = try_parse_date(raw)
        if candidate:
            return candidate
        print("Could not parse the date. Use YYYY-MM-DD. Type 'q' to exit.")


def run_interactive(
    default_currency: str,
    default_days: int,
    preset_start: Optional[dt.date] = None,
) -> tuple[str, int, dt.date]:
    """Run simple CLI to configure the data collection process."""
    print("\n=== CBR Currency Rate Parser ===")
    print("Answer the prompts or press Enter to accept defaults. Type 'q' to exit.\n")
    currency = prompt_currency(default_currency)
    days = prompt_days(default_days)
    start_date = prompt_start_date(days, preset_start)
    return currency, days, start_date


def ensure_directories() -> None:
    for path in (CSV_OUTPUT.parent, PLOT_OUTPUT.parent):
        path.mkdir(parents=True, exist_ok=True)


def export_to_csv(records: Iterable[RateSnapshot], destination: Path = CSV_OUTPUT) -> None:
    """Persist rate snapshots to CSV using pandas."""
    data = list(records)
    if not data:
        return
    df = pd.DataFrame({
        "date": [snap.date.isoformat() for snap in data],
        "currency": [snap.currency for snap in data],
        "value": [snap.value for snap in data],
    })
    destination.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(destination, index=False)


def plot_rates(records: Iterable[RateSnapshot], destination: Path = PLOT_OUTPUT) -> None:
    """Render a simple line chart of exchange rates and save to PNG."""
    data = sorted(list(records), key=lambda snap: snap.date)
    if not data:
        return
    dates = [snap.date for snap in data]
    values = [snap.value for snap in data]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(dates, values, marker="o", linewidth=2, color="#1f77b4")
    ax.set_title(f"{data[0].currency} rate vs. RUB")
    ax.set_xlabel("Date")
    ax.set_ylabel("Rate")
    ax.grid(True, linestyle="--", alpha=0.4)
    fig.autofmt_xdate()
    destination.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(destination, bbox_inches="tight")
    plt.close(fig)


def build_argument_parser() -> argparse.ArgumentParser:
    """Create CLI argument parser for configuring the application."""
    parser = argparse.ArgumentParser(
        description="Fetch and visualise currency rates from the Central Bank of Russia."
    )
    parser.add_argument(
        "--currency",
        help="Three-letter currency code, e.g. USD.",
    )
    parser.add_argument(
        "--days",
        type=int,
        help=f"Number of days to collect (1-{MAX_DAYS}).",
    )
    parser.add_argument(
        "--start-date",
        dest="start_date",
        help="Start date in YYYY-MM-DD format.",
    )
    parser.add_argument(
        "--no-prompt",
        action="store_true",
        help="Skip interactive prompts and use arguments/defaults.",
    )
    return parser


def preview(records: Iterable[RateSnapshot]) -> None:
    for snap in records:
        print(f"{snap.date.isoformat()} | {snap.currency}: {snap.value:.4f}")


def main() -> None:
    """Entry point for CLI execution."""
    parser = build_argument_parser()
    args = parser.parse_args()

    default_days = args.days if args.days is not None else DEFAULT_DAYS
    try:
        default_days = validate_days(default_days)
    except ValueError as exc:
        parser.error(str(exc))

    explicit_start: Optional[dt.date] = None
    if args.start_date:
        explicit_start = try_parse_date(args.start_date)
        if explicit_start is None:
            parser.error("start-date must use YYYY-MM-DD format")

    currency_default = (args.currency or DEFAULT_CURRENCY).upper()

    if args.no_prompt:
        currency = currency_default
        days = default_days
        start_date = resolve_start_date(days, explicit_start)
    else:
        try:
            currency, days, start_date = run_interactive(
                currency_default, default_days, explicit_start
            )
        except KeyboardInterrupt:
            print("\nExecution stopped by user.")
            return

    try:
        series = collect_series(
            start_date=start_date,
            days=days,
            currency_code=currency,
        )
    except requests.RequestException as exc:
        print(f"Failed to fetch data: {exc}")
        return

    if not series:
        print("No data available for the provided parameters.")
        return

    ensure_directories()
    preview(series)
    export_to_csv(series)
    plot_rates(series)
    print("\nSaved files:")
    print(f"CSV: {CSV_OUTPUT.resolve()}")
    print(f"Plot: {PLOT_OUTPUT.resolve()}")


if __name__ == "__main__":
    main()
