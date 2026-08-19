# go-e-sma-homewizard-controller
Platform independent solution to provide data for for a go-e-charger (GO-E-Charger Gemini in my case) with support for loadmanagment to avoid higher Austrian net charges for above 10KW house supprt and with a sample connection to a 15 years bluetooth connected sma inverter 

The script is quite simple and easy to understand - it has been created with google ai search (which helped me to find the right statments easier.
I used this script for a 1/2 Year already but as i was also now embedding new code to support load management and limmit power consumption of our house to 10 KW i thought it is time to release this code.

It might be useful for anyone owning a Go-charger with or without PV as the Homewizard P1 Meter is very useful for not only for PV charging but it can also be used for go-chargers to limit costs on the electricity bill as in Austria net
charges will be extended if 10KW are exceeded - though the exact regulation is not 100% clear yet.

Usage: - you have to adapt the script with the correct IP address for your go-e charger, and homewizard P1 meter (or replace the code with some other controller's code) Also you have to adapt the code for reading the data from an sma or or other inverter. 
This can be easily done with google ai search help.

Then you just need to start the script. (you might test with bash -x) I am also planning to release a debian package which includes startup file and more configuration files. This should be also able to run on a rasperry pi environment. (but i run it on a laptop with ubuntu 26.04)

The static energy dashboard and its CSV directory layout are described in
[WEBAPP.md](WEBAPP.md).

## Windows + Linux alternate solution

A dedicated Windows guide is available in [WINDOWS.md](WINDOWS.md).

It includes:

- build instructions for the `.exe`
- command-line parameters
- environment variable overrides
- example startup commands
- NSSM service installation guidance

Example build command:

```bat
go build -o go-e-sma-homewizard-controller.exe go-e-sma-homewizard-controller.go
```

Example startup command:

```bat
go-e-sma-homewizard-controller.exe -charger 192.168.1.50 -p1 192.168.1.60 -sma-log "C:\temp\sma-update.log" -max-power 10000 -margin 300 -debug
```

## Windows build and configuration

This project also contains a Windows-friendly Go implementation. The executable accepts command-line parameters and supports the same values via environment variables.

### Available command-line options

- `-charger`: IP address of the go-e charger, default `192.168.1.50`
- `-p1`: IP address of the HomeWizard P1 meter, default `192.168.1.60`
- `-sma-log`: path to the SMA log file, default `C:\temp\sma-update.log`
- `-max-power`: maximum power limit in watts, default `10000`
- `-margin`: safety margin in watts, default `300`
- `-debug`: enables debug logging

Example:

```bat
go-e-sma-homewizard-controller.exe -charger 192.168.1.50 -p1 192.168.1.60 -sma-log "C:\temp\sma-update.log" -max-power 10000 -margin 300 -debug
```

### Environment variable overrides

The application also reads these environment variables if they are set:

- `CHARGER_IP`
- `P1_IP`
- `SMA_LOG_FILE`
- `MAX_POWER_LIMIT_WATTS`
- `SAFETY_MARGIN_WATTS`

Example in Windows Command Prompt:

```bat
set CHARGER_IP=192.168.1.50
set P1_IP=192.168.1.60
set SMA_LOG_FILE=C:\temp\sma-update.log
set MAX_POWER_LIMIT_WATTS=10000
set SAFETY_MARGIN_WATTS=300
go-e-sma-homewizard-controller.exe -debug
```

### Compile the Windows executable

From the project directory:

```bat
go build -o go-e-sma-homewizard-controller.exe go-e-sma-homewizard-controller.go
```

If you are building on Linux or macOS and want a Windows `.exe` file, use:

```bash
GOOS=windows GOARCH=amd64 go build -o go-e-sma-homewizard-controller.exe go-e-sma-homewizard-controller.go
```

### Install and run as a Windows service

A practical way to run it continuously on Windows is to install it as a service with NSSM (Non-Sucking Service Manager).

1. Download and install NSSM.
2. Open an elevated Command Prompt.
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

If you prefer to use the built-in Windows Service Control Manager instead of NSSM, you can also create a service wrapper manually, but NSSM is usually the easiest option for a simple Go executable.

### Practical tips

- Use a fixed local path for the SMA log file, e.g. `C:\temp\sma-update.log`.
- Make sure the HomeWizard P1 meter and go-e charger are reachable on your local network.
- Test the executable once from the command line before installing it as a service.
- If the app does not start as a service, check the Windows Event Viewer and service log output.
- Running with `-debug` is useful for verifying the parameters and the initial network connectivity.

