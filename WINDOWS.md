# Windows setup and usage

This project also contains a Windows-friendly Go executable. The application is driven by command-line flags and also supports environment variable overrides.

## Build the Windows executable

From the project directory:

```bat
go build -o go-e-sma-homewizard-controller.exe go-e-sma-homewizard-controller.go
```

To cross-compile from Linux or macOS:

```bash
GOOS=windows GOARCH=amd64 go build -o go-e-sma-homewizard-controller.exe go-e-sma-homewizard-controller.go
```

## Optinal sunset and sunrise calculation

you have to init utilization of this external functionality:

go mod init go-e-sma-homewizard-controller
go get github.com/nathan-osman/go-sunrise

go build -tags solar -o go-e-sma-homewizard-controller.exe go-e-sma-homewizard-controller.go

or

GOOS=windows GOARCH=amd64 go build -tags solar -o go-e-sma-homewizard-controller.exe go-e-sma-homewizard-controller.go

can be used to include this calculation.

go mod init go-e-sma-homewizard-controller
go get github.com/nathan-osman/go-sunrise



## Command-line parameters

The program supports these flags:

- `-charger`: go-e charger IP, default `192.168.1.50`
- `-p1`: HomeWizard P1 meter IP, default `192.168.1.60`
- `-sma-log`: SMA log file path, default `C:\temp\sma-update.log` (if set empty the system will skip PV Data reading and still forward to the Charger.)
- `-max-power`: maximum allowed power in watts, default `10000`
- `-margin`: safety margin in watts, default `300`
- `-debug`: enable debug logging

Example:

```bat
go-e-sma-homewizard-controller.exe -charger 192.168.1.50 -p1 192.168.1.60 -sma-log "C:\temp\sma-update.log" -max-power 10000 -margin 300 -debug
```

## Environment variable overrides

These environment variables are also read automatically if they are set:

- `CHARGER_IP`
- `P1_IP`
- `SMA_LOG_FILE`
- `MAX_POWER_LIMIT_WATTS`
- `SAFETY_MARGIN_WATTS`

Example in Command Prompt:

```bat
set CHARGER_IP=192.168.1.50
set P1_IP=192.168.1.60
set SMA_LOG_FILE=C:\temp\sma-update.log
set MAX_POWER_LIMIT_WATTS=10000
set SAFETY_MARGIN_WATTS=300
go-e-sma-homewizard-controller.exe -debug
```

## Run it manually on Windows

Open a Command Prompt and start it from the folder where the executable is saved:

```bat
go-e-sma-homewizard-controller.exe -debug
```

This is the easiest way to verify that your charger and meter IP settings are correct before installing it as a service.

## Install as a Windows service with NSSM

A common method is to use NSSM (Non-Sucking Service Manager).

1. Download NSSM and install it.
2. Start an elevated Command Prompt.
3. Install the service:

```bat
nssm install go-e-sma-homewizard-controller "C:\path\to\go-e-sma-homewizard-controller.exe"
nssm set go-e-sma-homewizard-controller AppParameters "-charger 192.168.1.50 -p1 192.168.1.60 -sma-log \"C:\temp\sma-update.log\" -max-power 10000 -margin 300"
nssm start go-e-sma-homewizard-controller
```

Optional checks:

```bat
nssm status go-e-sma-homewizard-controller
sc query go-e-sma-homewizard-controller
```

This allows the controller to keep running in the background after Windows login or reboot.

## Alternative service notes

If you do not want to use NSSM, you can also create a Windows service wrapper manually, but NSSM is usually the easiest approach for a simple Go executable with command-line parameters.

## Tips

- Use a stable local log path such as `C:\temp\sma-update.log`.
- Verify networking before turning it into a service.
- Use `-debug` when troubleshooting startup issues.
- Check the Windows Event Viewer if the app fails to start as a service.

## Example startup script for a local Windows machine

```bat
@echo off
set CHARGER_IP=192.168.1.50
set P1_IP=192.168.1.60
set SMA_LOG_FILE=C:\temp\sma-update.log
set MAX_POWER_LIMIT_WATTS=10000
set SAFETY_MARGIN_WATTS=300
"C:\path\to\go-e-sma-homewizard-controller.exe" -debug
```
