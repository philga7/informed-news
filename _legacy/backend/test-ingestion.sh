#!/bin/bash
#
# Ingestion Layer Testing Script
# Quick tests for the new ingestion endpoints
#

# Configuration
API_URL="http://localhost:3001"
ORG_ID="${ORGANIZATION_ID:-}"
SOURCE_ID="${SOURCE_ID:-}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}$1${NC}"
  echo -e "${GREEN}========================================${NC}\n"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

# Test 1: Check ingestion status
test_status() {
  print_header "Test 1: Check Ingestion Status"
  
  response=$(curl -s "${API_URL}/api/ingest/status")
  
  if echo "$response" | jq -e '.status == "operational"' > /dev/null 2>&1; then
    print_success "Ingestion system is operational"
    echo "$response" | jq .
  else
    print_error "Ingestion system is not operational"
    echo "$response" | jq .
    return 1
  fi
}

# Test 2: Test RSS ingestion (requires ORG_ID and SOURCE_ID)
test_rss_ingestion() {
  print_header "Test 2: RSS Ingestion"
  
  if [ -z "$ORG_ID" ] || [ -z "$SOURCE_ID" ]; then
    print_warning "Skipping RSS ingestion test"
    echo "Set ORGANIZATION_ID and SOURCE_ID environment variables to run this test:"
    echo "  export ORGANIZATION_ID=your-org-id"
    echo "  export SOURCE_ID=your-source-id"
    return 0
  fi
  
  response=$(curl -s -X POST "${API_URL}/api/ingest/rss" \
    -H "Content-Type: application/json" \
    -d "{\"organization_id\": \"${ORG_ID}\", \"source_id\": \"${SOURCE_ID}\"}")
  
  if echo "$response" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "RSS ingestion completed"
    echo "$response" | jq .
  else
    print_error "RSS ingestion failed"
    echo "$response" | jq .
    return 1
  fi
}

# Test 3: Test manual input (requires ORG_ID)
test_manual_input() {
  print_header "Test 3: Manual Input"
  
  if [ -z "$ORG_ID" ]; then
    print_warning "Skipping manual input test"
    echo "Set ORGANIZATION_ID environment variable to run this test:"
    echo "  export ORGANIZATION_ID=your-org-id"
    return 0
  fi
  
  response=$(curl -s -X POST "${API_URL}/api/ingest/manual" \
    -H "Content-Type: application/json" \
    -d "{
      \"organization_id\": \"${ORG_ID}\",
      \"title\": \"Test Article - $(date)\",
      \"content\": \"This is a test article created by the ingestion test script.\",
      \"url\": \"https://example.com/test-$(date +%s)\",
      \"language\": \"en\"
    }")
  
  if echo "$response" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "Manual input completed"
    echo "$response" | jq .
  else
    print_error "Manual input failed"
    echo "$response" | jq .
    return 1
  fi
}

# Test 4: Check scheduler organizations
test_scheduler_status() {
  print_header "Test 4: Scheduler Status"
  
  response=$(curl -s "${API_URL}/api/scheduler/organizations")
  
  print_success "Scheduler status retrieved"
  echo "$response" | jq .
}

# Test 5: Test deprecated endpoint warning
test_deprecated_endpoint() {
  print_header "Test 5: Deprecated Endpoint Warning"
  
  print_warning "Testing deprecated endpoint (should still work but log warning)"
  
  response=$(curl -s -X POST "${API_URL}/api/feeds/fetch" \
    -H "Content-Type: application/json" \
    -d '{"sources": []}')
  
  echo "Response from deprecated endpoint:"
  echo "$response" | jq .
  
  print_warning "Check server logs for deprecation warning"
}

# Main execution
main() {
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║     Ingestion Layer Testing Suite (Plan 2)              ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  
  # Check dependencies
  if ! command -v jq &> /dev/null; then
    print_error "jq is not installed. Please install jq to run this script."
    echo "  macOS: brew install jq"
    echo "  Ubuntu: sudo apt-get install jq"
    exit 1
  fi
  
  # Check if server is running
  if ! curl -s "${API_URL}/health" > /dev/null 2>&1; then
    print_error "Server is not running at ${API_URL}"
    echo "Start the backend server: cd backend && npm run dev"
    exit 1
  fi
  
  print_success "Server is running at ${API_URL}"
  
  # Run tests
  test_status
  test_rss_ingestion
  test_manual_input
  test_scheduler_status
  test_deprecated_endpoint
  
  echo ""
  print_header "Testing Complete"
  
  if [ -z "$ORG_ID" ]; then
    echo ""
    print_warning "Some tests were skipped"
    echo "To run all tests, set environment variables:"
    echo "  export ORGANIZATION_ID=your-org-id"
    echo "  export SOURCE_ID=your-source-id"
    echo "  ./test-ingestion.sh"
  fi
}

# Run main function
main

