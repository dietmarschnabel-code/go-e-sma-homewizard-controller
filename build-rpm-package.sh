#!/bin/bash
# RPM package builder for go-e-sma-homewizard-controller
# This script automates the creation of an RPM package

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}===============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===============================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Configuration
PACKAGE_NAME="go-e-sma-homewizard-controller"
SPEC_FILE="${PACKAGE_NAME}.spec"
VERSION=$(grep "^Version:" ${SPEC_FILE} | awk '{print $2}')
RELEASE=$(grep "^Release:" ${SPEC_FILE} | awk '{print $2}' | sed 's/%{?dist}//')

print_header "RPM Package Builder"
print_info "Package: $PACKAGE_NAME"
print_info "Version: $VERSION"
print_info "Release: $RELEASE"

# Check if spec file exists
if [ ! -f "$SPEC_FILE" ]; then
    print_error "Spec file not found: $SPEC_FILE"
    exit 1
fi

# Check dependencies
print_header "Checking Dependencies"

if ! command -v rpmbuild &> /dev/null; then
    print_error "rpmbuild is required but not installed"
    echo ""
    echo "Install it with:"
    echo "  Ubuntu/Debian: sudo apt-get install rpm"
    echo "  Fedora/RHEL: sudo dnf install rpm-build"
    exit 1
fi

print_success "rpmbuild found"

if ! command -v go &> /dev/null; then
    print_error "go is required but not installed"
    exit 1
fi

print_success "go found"

# Verify Go source
print_header "Validating Go Source"
if go vet go-e-sma-homewizard-controller.go nighttime_basic.go; then
    print_success "Go source is valid"
else
    print_error "Go source validation failed"
    exit 1
fi

# Check required files
print_header "Checking Required Files"

REQUIRED_FILES=(
    "${PACKAGE_NAME}.go"
    "nighttime_basic.go"
    "nighttime_solar.go"
    "Makefile"
    "${PACKAGE_NAME}.conf"
    "debian/systemd/${PACKAGE_NAME}.service"
    "README.md"
    "LICENSE"
    "INSTALL.md"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "Found: $file"
    else
        print_error "Missing: $file"
        exit 1
    fi
done

# Create build directory structure
print_header "Setting Up Build Environment"

BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/rpmbuild-XXXXXX")
mkdir -p "${BUILD_DIR}"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}

print_success "Build directory created: $BUILD_DIR"

# Create source tarball
print_header "Creating Source Tarball"

SOURCE_DIR="${BUILD_DIR}/SOURCES/${PACKAGE_NAME}-${VERSION}"
mkdir -p "$SOURCE_DIR"

# Copy files to source directory
cp "${PACKAGE_NAME}.go" "$SOURCE_DIR/"
cp nighttime_basic.go nighttime_solar.go Makefile "$SOURCE_DIR/"
cp "${PACKAGE_NAME}.conf" "$SOURCE_DIR/"
cp -r debian/ "$SOURCE_DIR/"
cp README.md "$SOURCE_DIR/"
cp LICENSE "$SOURCE_DIR/"
cp INSTALL.md "$SOURCE_DIR/"

# Copy spec file
cp "$SPEC_FILE" "${BUILD_DIR}/SPECS/"
print_success "Spec file copied to SPECS directory"

# Create tarball
cd "${BUILD_DIR}/SOURCES"
tar -czf "${PACKAGE_NAME}-${VERSION}.tar.gz" "${PACKAGE_NAME}-${VERSION}"
print_success "Source tarball created: ${PACKAGE_NAME}-${VERSION}.tar.gz"

# Return to original directory before copying files
cd - >/dev/null

# Build RPM
print_header "Building RPM Package"

rpmbuild --define "_topdir ${BUILD_DIR}" -ba "${BUILD_DIR}/SPECS/${SPEC_FILE}"

# Copy built RPMs to current directory
print_header "Finalizing Build"

# Find and copy the architecture-specific RPM (handles dist tags like .fc44, .el8, etc.)
RPM_FILE=$(find "${BUILD_DIR}/RPMS/" -type f -name "${PACKAGE_NAME}-${VERSION}-*.rpm" 2>/dev/null | head -1)
if [ -f "$RPM_FILE" ]; then
    cp "$RPM_FILE" ./
    RPM_FILENAME=$(basename "$RPM_FILE")
    print_success "RPM package created: $RPM_FILENAME"
else
    print_error "RPM package build failed"
    exit 1
fi

# Find and copy the source RPM (handles dist tags like .fc44, .el8, etc.)
SRCRPM=$(find "${BUILD_DIR}/SRPMS/" -name "${PACKAGE_NAME}-${VERSION}-*.src.rpm" 2>/dev/null | head -1)
if [ -f "$SRCRPM" ]; then
    cp "$SRCRPM" ./
    SRCRPM_FILENAME=$(basename "$SRCRPM")
    print_success "Source RPM created: $SRCRPM_FILENAME"
fi

# Cleanup
print_info "Cleaning up build directory"
rm -rf "$BUILD_DIR"

# Display installation instructions
print_header "Build Complete!"
echo ""
echo "Installation instructions:"
echo ""
echo "  For Fedora/RHEL/CentOS:"
echo "    sudo dnf install ./${PACKAGE_NAME}-${VERSION}-${RELEASE}.*.rpm"
echo ""
echo "  Or with rpm:"
echo "    sudo rpm -ivh ./${PACKAGE_NAME}-${VERSION}-${RELEASE}.*.rpm"
echo ""
echo "IMPORTANT: After installation, update the configuration file:"
echo "  sudo nano /etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf"
echo ""
echo "Then enable and start the service:"
echo "  sudo systemctl enable go-e-sma-homewizard-controller"
echo "  sudo systemctl start go-e-sma-homewizard-controller"
echo ""
echo "Check service status:"
echo "  sudo systemctl status go-e-sma-homewizard-controller"
echo "  sudo journalctl -u go-e-sma-homewizard-controller -f"
