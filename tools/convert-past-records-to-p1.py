import argparse
import os
import numpy as np
import pandas as pd


def get_seasonal_export_weight(date):
    """Calculates grid export weight using gentle solar angle scaling (power 0.5, floor 0.07)."""
    day_of_year = date.dayofyear
    solar_factor = 0.5 + 0.5 * np.cos(2 * np.pi * (day_of_year - 172) / 365.25)
    export_weight = np.power(solar_factor, 0.5)
    return max(export_weight, 0.07)


def interpolate_p1_export_gaps(
    df, date_col="date", export_col="export_kwh", import_col="import_kwh"
):
    """Fills missing daily P1 data using seasonal solar weighting for exports and linear interpolation for imports."""
    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col])

    # Collapse multiple intra-day readings to last entry per day
    df = df.groupby(date_col, as_index=False).last()
    df = df.sort_values(date_col).reset_index(drop=True)

    # Reindex to a complete continuous daily date range
    full_dates = pd.date_range(
        start=df[date_col].min(), end=df[date_col].max(), freq="D"
    )
    df_daily = df.set_index(date_col).reindex(full_dates)
    df_daily.index.name = date_col
    df_daily = df_daily.reset_index()

    # Pre-calculate daily seasonal weights
    df_daily["_exp_weight"] = df_daily[date_col].apply(get_seasonal_export_weight)

    # Interpolate solar export gaps proportional to seasonal weights
    if export_col in df_daily.columns:
        known_mask = df_daily[export_col].notna()
        known_indices = df_daily.index[known_mask].tolist()

        for i in range(len(known_indices) - 1):
            idx_start, idx_end = known_indices[i], known_indices[i + 1]

            if idx_end - idx_start > 1:
                val_start = df_daily.loc[idx_start, export_col]
                val_end = df_daily.loc[idx_end, export_col]

                gap_weights = df_daily.loc[
                    idx_start:idx_end, "_exp_weight"
                ].cumsum()
                gap_weights = gap_weights - gap_weights.iloc[0]
                total_weight = gap_weights.iloc[-1]

                delta_export = val_end - val_start
                if total_weight > 0:
                    df_daily.loc[idx_start + 1 : idx_end - 1, export_col] = (
                        val_start
                        + delta_export * (gap_weights.iloc[1:-1] / total_weight)
                    )

    # Linear interpolation for import cumulative totals
    if import_col in df_daily.columns:
        df_daily[import_col] = df_daily[import_col].interpolate(method="linear")

    return df_daily.drop(columns=["_exp_weight"])


def process_p1_csv(
    input_csv,
    output_dir="./p1",
    date_col="datum",
    export_col="einspeisung",
    import_col="bezug",
    monthly_charger_kwh=0.0,
):
    """Processes P1 meter CSV, interpolates export gaps, splits into monthly CSVs,

    and distributes monthly EV charger energy across daily rows.
    """
    df = pd.read_csv(input_csv)

    # Normalize column names
    df.columns = [c.strip().lower() for c in df.columns]
    date_col = date_col.lower()
    export_col = export_col.lower()
    import_col = import_col.lower()

    # Perform seasonal gap filling
    df_interpolated = interpolate_p1_export_gaps(
        df,
        date_col=date_col,
        export_col=export_col,
        import_col=import_col,
    )

    # Calculate daily deltas for export and import
    if df_interpolated[export_col].is_monotonic_increasing:
        df_interpolated["daily_export_kwh"] = (
            df_interpolated[export_col].diff().clip(lower=0).fillna(0)
        )
    else:
        df_interpolated["daily_export_kwh"] = df_interpolated[export_col]

    if (
        import_col in df_interpolated.columns
        and df_interpolated[import_col].is_monotonic_increasing
    ):
        df_interpolated["daily_import_kwh"] = (
            df_interpolated[import_col].diff().clip(lower=0).fillna(0)
        )
    else:
        df_interpolated["daily_import_kwh"] = df_interpolated.get(
            import_col, 0
        )

    # Date groupings and daily EV charger allocation
    df_interpolated["year"] = df_interpolated[date_col].dt.year
    df_interpolated["ym"] = df_interpolated[date_col].dt.strftime("%Y%m")
    df_interpolated["days_in_month"] = df_interpolated[
        date_col
    ].dt.days_in_month

    df_interpolated["daily_charger_kwh"] = (
        monthly_charger_kwh / df_interpolated["days_in_month"]
    ).round(3)

    os.makedirs(output_dir, exist_ok=True)

    # Write out yearly/monthly folder hierarchy
    grouped = df_interpolated.groupby(["year", "ym"])
    for (year, ym), group in grouped:
        year_dir = os.path.join(output_dir, str(year))
        os.makedirs(year_dir, exist_ok=True)

        out_path = os.path.join(year_dir, f"p1-data-{ym}.csv")

        export_df = pd.DataFrame(
            {
                "date": group[date_col].dt.strftime("%Y-%m-%d"),
                "import_kwh": group["daily_import_kwh"].round(3),
                "export_kwh": group["daily_export_kwh"].round(3),
                "charger_kwh": group["daily_charger_kwh"],
            }
        )

        export_df.to_csv(out_path, index=False)
        print(f"Generated: {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Process P1 CSV data into monthly folders with daily values."
    )
    parser.add_argument("input_csv", help="Path to input raw CSV file")
    parser.add_argument(
        "--output-dir",
        default="./p1",
        help="Root folder for output files (default: ./p1)",
    )
    parser.add_argument(
        "--date-col", default="datum", help="Date column name (default: datum)"
    )
    parser.add_argument(
        "--export-col",
        default="einspeisung",
        help="Grid export column (default: einspeisung)",
    )
    parser.add_argument(
        "--import-col",
        default="bezug",
        help="Grid import column (default: bezug)",
    )
    parser.add_argument(
        "--monthly-charger-kwh",
        type=float,
        default=0.0,
        help="Monthly EV charging total in kWh to distribute evenly per day (default: 0.0)",
    )

    args = parser.parse_args()

    process_p1_csv(
        input_csv=args.input_csv,
        output_dir=args.output_dir,
        date_col=args.date_col,
        export_col=args.export_col,
        import_col=args.import_col,
        monthly_charger_kwh=args.monthly_charger_kwh,
    )