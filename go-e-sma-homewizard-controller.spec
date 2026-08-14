Name:           go-e-sma-homewizard-controller
Version:        1.0.0
Release:        1%{?dist}
Summary:        go-e-charger load management controller with PV support
License:        MIT
URL:            https://github.com/dietmarschnabel-code/go-e-sma-homewizard-controller
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch
BuildRequires:  bash

Requires:       bash
Requires:       curl
Requires:       jq

%description
Linux bash script to provide data for a go-e-charger with support for load
management to avoid higher Austrian net charges for above 10KW house power.
Includes sample connection to SMA inverter via Bluetooth.

Features:
- Automatic charging current adjustment based on available house power
- PV surplus detection and integration
- Support for SMA inverters via Bluetooth

%prep
%setup -q

%build
# No build required for shell script
# Validate bash syntax
bash -n %{name}.sh

%install
# Create directories
install -d %{buildroot}%{_bindir}
install -d %{buildroot}%{_sysconfdir}/%{name}
install -d %{buildroot}%{_unitdir}
install -d -m 0775 %{buildroot}%{_localstatedir}/log/%{name}

# Install main script
install -m 0755 %{name}.sh %{buildroot}%{_bindir}/%{name}

# Install configuration file
install -m 0644 %{name}.conf %{buildroot}%{_sysconfdir}/%{name}/%{name}.conf.example
install -m 0644 %{name}.conf %{buildroot}%{_sysconfdir}/%{name}/%{name}.conf

# Install systemd service file
install -m 0644 debian/systemd/%{name}.service %{buildroot}%{_unitdir}/%{name}.service

%pre
# Create service group if it doesn't exist
if ! getent group %{name} >/dev/null 2>&1; then
    groupadd -r %{name} 2>/dev/null || true
fi

# Create service user if it doesn't exist
if ! getent passwd %{name} >/dev/null 2>&1; then
    useradd -r -g %{name} -s /bin/false -d /nonexistent -m %{name} 2>/dev/null || true
fi

%post
# Ensure service user and group exist
if ! getent group %{name} >/dev/null 2>&1; then
    groupadd -r %{name} 2>/dev/null || true
fi
if ! getent passwd %{name} >/dev/null 2>&1; then
    useradd -r -g %{name} -s /bin/false -d /nonexistent -m %{name} 2>/dev/null || true
fi

# Set correct ownership and permissions for log directory
if [ -d %{_localstatedir}/log/%{name} ]; then
    chown -R %{name}:%{name} %{_localstatedir}/log/%{name} 2>/dev/null || true
    chmod 0775 %{_localstatedir}/log/%{name} 2>/dev/null || true
fi

# Reload systemd daemon
systemctl daemon-reload || true
echo ""
echo "Installation complete!"
echo ""
echo "IMPORTANT: Before starting the service, you MUST update the configuration:"
echo "  Edit: %{_sysconfdir}/%{name}/%{name}.conf"
echo ""
echo "Then enable and start the service:"
echo "  systemctl enable %{name}"
echo "  systemctl start %{name}"

%preun
# Stop service before uninstall
if [ $1 -eq 0 ]; then
    systemctl stop %{name} >/dev/null 2>&1 || true
    systemctl disable %{name} >/dev/null 2>&1 || true
fi

%postun
# Reload systemd daemon after uninstall
systemctl daemon-reload >/dev/null 2>&1 || true

%files
%doc README.md LICENSE INSTALL.md
%attr(0755, root, root) %{_bindir}/%{name}
%attr(0644, root, root) %config(noreplace) %{_sysconfdir}/%{name}/%{name}.conf
%attr(0644, root, root) %{_sysconfdir}/%{name}/%{name}.conf.example
%attr(0644, root, root) %{_unitdir}/%{name}.service
%dir %{_localstatedir}/log/%{name}

%changelog
* Thu Aug 14 2026 Dietmar Schnabel <dietmar@example.com> - 1.0.0-1
  - Initial RPM package release
  - Refactored bash script with function-based architecture
  - Added configuration file support
  - Added systemd service integration
  - Added comprehensive logging and debug mode
