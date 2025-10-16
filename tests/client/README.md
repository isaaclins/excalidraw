# Excalidraw Client Tests

This directory contains comprehensive tests for the Excalidraw client application.

## Test Coverage

### 147 Tests Across 5 Test Suites

1. **WebSocket/CollaborationClient Tests** (22 tests)

   - Connection error handling
   - Network timeout scenarios
   - Disconnect/reconnect behavior
   - Room joining edge cases
   - Broadcast functionality
   - Error recovery

2. **Storage Tests** (45 tests)

   - **ServerStorage**: Network failures, 404s, 500s, timeouts
   - **LocalStorage**: Tauri invoke failures, database errors
   - Drawing operations (save, load, update, delete)
   - Snapshot operations (create, list, load, delete, update)
   - Room settings (get, update)
   - Invalid data handling
   - Large payload handling

3. **Reconciliation Logic Tests** (32 tests)

   - Version conflict resolution
   - Element ordering with z-index
   - Concurrent edits from multiple users
   - Editing state protection (editing, resizing, dragging)
   - Duplicate element removal
   - Empty array handling
   - Large array performance

4. **API Tests** (28 tests)

   - Config loading and saving
   - Connection management
   - Error propagation
   - URL validation
   - Disconnection handling

5. **ConnectionDialog Component Tests** (20 tests)
   - Rendering states (connected/disconnected)
   - User interactions
   - Form validation
   - Error handling
   - Accessibility
   - Edge cases (corrupted localStorage, missing props)

## Running Tests

### Locally

```bash
# From the excalidraw-app directory
npm test

# Watch mode
npm run test:watch

# UI mode
npm run test:ui
```

### Via Test Runner Script

```bash
# From the repository root
./tests/client/run.sh
```

## Test Philosophy

These tests follow best practices by:

1. **Not Taking the Happy Path**: Tests focus on error conditions, edge cases, and failure scenarios
2. **Testing Behavior, Not Implementation**: Tests verify what the code does, not how it does it
3. **Isolation**: Each test is independent and can run in any order
4. **Realistic Scenarios**: Tests simulate real-world conditions like network failures, malformed data, and race conditions

## Key Test Scenarios

### Network Failures

- Connection timeouts
- Server errors (404, 500)
- Malformed responses
- Network disconnections

### Data Edge Cases

- Empty arrays and null values
- Very large payloads (1000+ elements)
- Corrupted JSON
- Missing required fields
- Special characters in IDs

### Concurrency

- Multiple users editing simultaneously
- Version conflicts
- Race conditions
- State synchronization

### User Interactions

- Rapid button clicks
- Invalid input
- Form validation
- Keyboard shortcuts

## Technologies

- **Vitest**: Fast unit test framework
- **React Testing Library**: Component testing
- **User Event**: Realistic user interaction simulation
- **jsdom**: DOM environment for tests

## Coverage

The test suite provides comprehensive coverage of:

- ✅ Error handling paths
- ✅ Edge cases and boundary conditions
- ✅ User interactions and accessibility
- ✅ Network failure scenarios
- ✅ Data validation and sanitization
- ✅ Concurrent operations
