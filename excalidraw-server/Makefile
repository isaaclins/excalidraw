.PHONY: help lint lint-fix fmt test test-verbose test-coverage build run clean install-tools

# Go binary path
GOPATH := $(shell go env GOPATH)
GOBIN := $(GOPATH)/bin
GOLANGCI_LINT := $(GOBIN)/golangci-lint
GOIMPORTS := $(GOBIN)/goimports

# Default target
help:
	@echo "Available targets:"
	@echo "  make lint          - Run linters without fixing"
	@echo "  make lint-fix      - Run linters with auto-fix enabled"
	@echo "  make fmt           - Format code with gofmt and goimports"
	@echo "  make test          - Run all tests"
	@echo "  make test-verbose  - Run tests with verbose output"
	@echo "  make test-coverage - Run tests with coverage report"
	@echo "  make build         - Build the server binary"
	@echo "  make run           - Build and run the server"
	@echo "  make clean         - Clean build artifacts"
	@echo "  make install-tools - Install required Go tools"

# Install required tools
install-tools:
	@echo "Installing golangci-lint..."
	@go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@echo "Installing goimports..."
	@go install golang.org/x/tools/cmd/goimports@latest
	@echo "Tools installed successfully!"
	@echo "golangci-lint: $(GOLANGCI_LINT)"
	@echo "goimports: $(GOIMPORTS)"

# Run linters without fixing
lint:
	@echo "Running linters..."
	$(GOLANGCI_LINT) run

# Run linters with auto-fix
lint-fix:
	@echo "Running linters with auto-fix..."
	$(GOLANGCI_LINT) run --fix
	@echo "Linting complete! ✓"

# Format code
fmt:
	@echo "Formatting Go code..."
	@gofmt -w -s .
	@$(GOIMPORTS) -w .
	@echo "Formatting complete! ✓"

# Run tests
test:
	@echo "Running tests..."
	@go test ./... -v

# Run tests with verbose output
test-verbose:
	@echo "Running tests (verbose)..."
	@go test -v -race ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	@go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
	@go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Build the server
build:
	@echo "Building server..."
	@go build -o excalidraw-server .
	@echo "Build complete! Binary: excalidraw-server"

# Build and run
run: build
	@echo "Starting server..."
	@./excalidraw-server

# Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -f excalidraw-server
	@rm -f coverage.out coverage.html
	@rm -f *.db
	@echo "Clean complete! ✓"

