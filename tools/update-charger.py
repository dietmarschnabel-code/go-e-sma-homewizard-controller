import glob
import os
import sys
import pandas as pd


def update_existing_charger_kwh(target_path, monthly_kwh):
    """Updates only the charger_kwh column in existing CSV files."""
    if os.path.isfile(target_path):
        files = [target_path]
    else:
        files = glob.glob(
            os.path.join(target_path, "**/*.csv"), recursive=True
        )

    for filepath in files:
        df = pd.read_csv(filepath)

        # Count daily rows in the existing file
        days_in_month = len(df)
        daily_value = round(monthly_kwh / days_in_month, 3)

        # Modify only the charger_kwh column
        df["charger_kwh"] = daily_value

        # Save back to same file, preserving existing import/export data
        df.to_csv(filepath, index=False)
        print(f"Updated {filepath} -> {daily_value} kWh/day")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "./p1"
    monthly_kwh = float(sys.argv[2]) if len(sys.argv) > 2 else 150.0

    update_existing_charger_kwh(path, monthly_kwh)