# Portal converter

`portal-converter-goe-netz-noe.go` converts exported CSV data from Netz NÖ and,
optionally, go-eCharger into the P1 CSV layout used by this project. It is
intended for importing historical data into the `webapp/p1/` directory or for
preparing data before starting the dashboard.

## What it does

The converter reads:

- a Netz-NÖ CSV containing grid import (`Verbrauch`) and grid export
  (`Einspeisung`) readings,
- optionally, a go-eCharger CSV containing charging sessions.

It sorts the Netz-NÖ readings by timestamp and writes one or both of these
file types:

- **Monthly:** one file per month, containing one summed row per day.
- **Daily:** one file per day, containing cumulative grid meters and
  five-minute values. Each Netz-NÖ 15-minute interval is divided into three
  five-minute records. Charger sessions are represented by their meter value
  and calculated charging power while a session is active.

The output directory is created automatically if it does not exist. Existing
files with the same names are overwritten.

## Input CSV formats

### Netz NÖ CSV

The file must use semicolons (`;`) as separators and contain columns whose
names start with:

- `Messzeitpunkt`
- `Einspeisung`
- `Verbrauch`

Timestamps must have this format:

```text
02.01.2006 15:04
```

Decimal commas are accepted. Example:

```text
Messzeitpunkt;Einspeisung;Verbrauch
19.08.2026 12:15;0,125;0,450
```

The `-noe` option is mandatory.

### go-eCharger CSV

The charger file is optional. It must contain these columns:

- `Start`
- `End`
- `Energy` or `Meter Difference`
- `Meter start`
- `Meter end`

Start and end timestamps must have this format, including the timezone offset:

```text
02.01.2006 15:04:05-07:00
```

If the charger CSV cannot be read, the converter logs a warning and continues
with the Netz-NÖ data. Without `-goe`, charger values remain zero apart from
the configured charger offset in daily output.

## Python tools

`convert-past-records-to-p1.py` reads a P1 meter CSV, interpolates missing
daily P1 values, and writes the processed data as monthly CSV files.

`update-charger.py` updates existing CSV files with fixed daily charger values
calculated from a supplied monthly charger total, while preserving the other
meter data.

## Compile

Run these commands from the repository root:

```bash
go build -o portal-converter-goe-netz-noe ./tools/portal-converter-goe-netz-noe.go
```

This creates the `portal-converter-goe-netz-noe` executable in the repository
root. To build directly inside the tools directory instead:

```bash
cd tools
go build -o portal-converter-goe-netz-noe portal-converter-goe-netz-noe.go
```

Go 1.18 or newer is recommended. The converter uses only the Go standard
library and has no external dependencies.

To inspect the available options after compiling:

```bash
./portal-converter-goe-netz-noe -h
```

## Usage

```text
./portal-converter-goe-netz-noe \
  -noe /path/to/netz-noe.csv \
  [-goe /path/to/goe-charger.csv] \
  [-out ./p1] \
  [-mode both] \
  [-import-offset 0] \
  [-export-offset 0] \
  [-charger-offset 0]
```

### Options

| Option | Default | Description |
| --- | --- | --- |
| `-noe` | none | Path to the mandatory Netz-NÖ CSV. |
| `-goe` | none | Path to the optional go-eCharger CSV. |
| `-out` | `./p1` | Output directory. |
| `-mode` | `both` | Output mode: `monthly`, `daily`, or `both`. |
| `-import-offset` | `0` | Initial cumulative grid-import meter value in kWh for daily files. |
| `-export-offset` | `0` | Initial cumulative grid-export meter value in kWh for daily files. |
| `-charger-offset` | `0` | Initial cumulative charger meter value in kWh for daily files. |

Offsets are starting meter readings, not energy to add to the imported
period. For example, use `-import-offset 1234.5` when the first generated
daily cumulative import value should continue at 1234.5 kWh. The offsets do
not affect monthly summaries.

## Examples

Generate monthly and daily files in `./p1`:

```bash
./portal-converter-goe-netz-noe \
  -noe ./exports/netz-noe.csv \
  -goe ./exports/goe-charger.csv \
  -out ./p1 \
  -mode both
```

Generate only monthly summaries:

```bash
./portal-converter-goe-netz-noe \
  -noe ./exports/netz-noe.csv \
  -out ./p1 \
  -mode monthly
```

Continue cumulative daily meters from existing readings:

```bash
./portal-converter-goe-netz-noe \
  -noe ./exports/netz-noe.csv \
  -goe ./exports/goe-charger.csv \
  -out ./p1 \
  -mode daily \
  -import-offset 1234.500 \
  -export-offset 456.700 \
  -charger-offset 78.900
```

## Output files

Monthly output is named `p1-data-YYYYMM.csv` and has this header:

```text
date,import_kwh,export_kwh,charger_kwh
```

Daily output is named `p1-data-YYYYMMDD.csv` and has this header:

```text
timestamp,import_kwh,export_kwh,active_power_w,charger_total_kwh,charger_power_w
```

`import_kwh`, `export_kwh`, and `charger_total_kwh` are cumulative values in
the daily files. `active_power_w` is positive for net import and negative for
net export. The generated names use a hyphen (`p1-data-...`). The dashboard
also supports these names; see [`WEBAPP.md`](../WEBAPP.md) for the complete
webapp data layout and compatibility notes.

After conversion, copy or place the generated directory where the web server
can serve it as `/p1/`, for example:

```bash
cp -a ./p1 ./webapp/p1
cd webapp
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Summary output

After processing, the converter prints the covered time range, total imported
and exported energy, total EV charging energy, starting offsets, and final
cumulative values. This provides a quick check that the selected exports and
offsets produced the expected totals.
