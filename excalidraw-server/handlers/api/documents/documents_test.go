package documents

import (
	"bytes"
	"context"
	"encoding/json"
	"excalidraw-server/core"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
)

// Mock document store for testing
type mockDocumentStore struct {
	mu        sync.RWMutex
	documents map[string]*core.Document
	createErr error
	findErr   error
}

func newMockStore() *mockDocumentStore {
	return &mockDocumentStore{
		documents: make(map[string]*core.Document),
	}
}

func (m *mockDocumentStore) Create(ctx context.Context, doc *core.Document) (string, error) {
	if m.createErr != nil {
		return "", m.createErr
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	id := fmt.Sprintf("mock-id-%d", len(m.documents))
	m.documents[id] = doc
	return id, nil
}

func (m *mockDocumentStore) FindID(ctx context.Context, id string) (*core.Document, error) {
	if m.findErr != nil {
		return nil, m.findErr
	}
	m.mu.RLock()
	doc, exists := m.documents[id]
	m.mu.RUnlock()
	if !exists {
		return nil, fmt.Errorf("document with id %s not found", id)
	}
	return doc, nil
}

func TestHandleCreate_Success(t *testing.T) {
	store := newMockStore()
	handler := HandleCreate(store)

	testData := `{"elements":[],"appState":{}}`
	req := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader(testData))
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var response DocumentCreateResponse
	err := json.NewDecoder(rec.Body).Decode(&response)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.ID == "" {
		t.Error("Response ID is empty")
	}

	// Verify document was stored
	if len(store.documents) != 1 {
		t.Errorf("Expected 1 document in store, got %d", len(store.documents))
	}
}

func TestHandleCreate_EmptyBody(t *testing.T) {
	store := newMockStore()
	handler := HandleCreate(store)

	req := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader(""))
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var response DocumentCreateResponse
	err := json.NewDecoder(rec.Body).Decode(&response)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.ID == "" {
		t.Error("Response ID is empty")
	}
}

func TestHandleCreate_LargePayload(t *testing.T) {
	store := newMockStore()
	handler := HandleCreate(store)

	// Create a 5MB payload
	largeData := strings.Repeat("x", 5*1024*1024)
	req := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader(largeData))
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	// Verify large document was stored
	if len(store.documents) != 1 {
		t.Error("Large document was not stored")
	}

	for _, doc := range store.documents {
		if doc.Data.Len() != len(largeData) {
			t.Errorf("Document size mismatch: got %d, want %d", doc.Data.Len(), len(largeData))
		}
	}
}

func TestHandleCreate_UTF8Content(t *testing.T) {
	store := newMockStore()
	handler := HandleCreate(store)

	testData := `{"text":"Hello 世界 🌍"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader(testData))
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	// Verify UTF-8 content was preserved
	for _, doc := range store.documents {
		if doc.Data.String() != testData {
			t.Errorf("UTF-8 content not preserved: got %q, want %q", doc.Data.String(), testData)
		}
	}
}

func TestHandleCreate_StoreError(t *testing.T) {
	store := newMockStore()
	store.createErr = fmt.Errorf("database error")
	handler := HandleCreate(store)

	req := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader("test"))
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusInternalServerError)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "Failed to save") {
		t.Errorf("Error message mismatch: got %q", body)
	}
}

func TestHandleCreate_ContentTypes(t *testing.T) {
	testCases := []struct {
		name        string
		contentType string
		data        string
	}{
		{"JSON", "application/json", `{"key":"value"}`},
		{"Plain text", "text/plain", "plain text data"},
		{"No content type", "", "some data"},
		{"Binary", "application/octet-stream", string([]byte{0, 1, 2, 3})},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			store := newMockStore()
			handler := HandleCreate(store)

			req := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader(tc.data))
			if tc.contentType != "" {
				req.Header.Set("Content-Type", tc.contentType)
			}
			rec := httptest.NewRecorder()

			handler(rec, req)

			if rec.Code != http.StatusOK {
				t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
			}
		})
	}
}

func TestHandleGet_Success(t *testing.T) {
	store := newMockStore()
	handler := HandleGet(store)

	// Add a document to the store
	testData := "test document data"
	testID := "test-id"
	store.documents[testID] = &core.Document{
		Data: *bytes.NewBufferString(testData),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v2/"+testID, http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", testID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	body, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	if string(body) != testData {
		t.Errorf("Response body mismatch: got %q, want %q", string(body), testData)
	}
}

func TestHandleGet_NotFound(t *testing.T) {
	store := newMockStore()
	handler := HandleGet(store)

	req := httptest.NewRequest(http.MethodGet, "/api/v2/nonexistent", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "nonexistent")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusNotFound)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "not found") {
		t.Errorf("Error message mismatch: got %q", body)
	}
}

func TestHandleGet_EmptyDocument(t *testing.T) {
	store := newMockStore()
	handler := HandleGet(store)

	testID := "empty-doc"
	store.documents[testID] = &core.Document{
		Data: *bytes.NewBuffer(nil),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v2/"+testID, http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", testID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	body, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	if len(body) != 0 {
		t.Errorf("Expected empty body, got %d bytes", len(body))
	}
}

func TestHandleGet_LargeDocument(t *testing.T) {
	store := newMockStore()
	handler := HandleGet(store)

	largeData := strings.Repeat("x", 5*1024*1024)
	testID := "large-doc"
	store.documents[testID] = &core.Document{
		Data: *bytes.NewBufferString(largeData),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v2/"+testID, http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", testID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	body, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	if len(body) != len(largeData) {
		t.Errorf("Response size mismatch: got %d, want %d", len(body), len(largeData))
	}
}

func TestHandleGet_SpecialCharacters(t *testing.T) {
	store := newMockStore()
	handler := HandleGet(store)

	testData := "Hello 世界 🌍\n\t!@#$%^&*()"
	testID := "special-chars"
	store.documents[testID] = &core.Document{
		Data: *bytes.NewBufferString(testData),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v2/"+testID, http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", testID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	body, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	if string(body) != testData {
		t.Errorf("Special characters not preserved: got %q, want %q", string(body), testData)
	}
}

func TestHandleGet_StoreError(t *testing.T) {
	store := newMockStore()
	store.findErr = fmt.Errorf("database error")
	handler := HandleGet(store)

	req := httptest.NewRequest(http.MethodGet, "/api/v2/test-id", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-id")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestHandleGet_MissingIDParameter(t *testing.T) {
	store := newMockStore()
	handler := HandleGet(store)

	req := httptest.NewRequest(http.MethodGet, "/api/v2/", http.NoBody)
	// Don't add ID parameter
	rctx := chi.NewRouteContext()
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestCreateAndRetrieve_Integration(t *testing.T) {
	store := newMockStore()
	createHandler := HandleCreate(store)
	getHandler := HandleGet(store)

	// Create a document
	testData := `{"elements":[{"type":"rectangle","x":10,"y":20}],"appState":{}}`
	createReq := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader(testData))
	createRec := httptest.NewRecorder()

	createHandler(createRec, createReq)

	if createRec.Code != http.StatusOK {
		t.Fatalf("Create failed: status %d", createRec.Code)
	}

	var createResponse DocumentCreateResponse
	err := json.NewDecoder(createRec.Body).Decode(&createResponse)
	if err != nil {
		t.Fatalf("Failed to decode create response: %v", err)
	}

	// Retrieve the document
	getReq := httptest.NewRequest(http.MethodGet, "/api/v2/"+createResponse.ID, http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", createResponse.ID)
	getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, rctx))

	getRec := httptest.NewRecorder()

	getHandler(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("Get failed: status %d", getRec.Code)
	}

	body, err := io.ReadAll(getRec.Body)
	if err != nil {
		t.Fatalf("Failed to read response body: %v", err)
	}

	if string(body) != testData {
		t.Errorf("Retrieved data mismatch: got %q, want %q", string(body), testData)
	}
}

func TestConcurrentCreateAndGet(t *testing.T) {
	store := newMockStore()
	createHandler := HandleCreate(store)
	getHandler := HandleGet(store)

	numWorkers := 5
	done := make(chan bool, numWorkers)
	errors := make(chan error, numWorkers*2)

	for i := 0; i < numWorkers; i++ {
		go func(index int) {
			defer func() { done <- true }()

			// Create
			data := fmt.Sprintf(`{"worker":%d}`, index)
			createReq := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader(data))
			createRec := httptest.NewRecorder()
			createHandler(createRec, createReq)

			if createRec.Code != http.StatusOK {
				errors <- fmt.Errorf("worker %d: create failed with status %d", index, createRec.Code)
				return
			}

			var response DocumentCreateResponse
			err := json.NewDecoder(createRec.Body).Decode(&response)
			if err != nil {
				errors <- fmt.Errorf("worker %d: failed to decode response: %v", index, err)
				return
			}

			// Get
			getReq := httptest.NewRequest(http.MethodGet, "/api/v2/"+response.ID, http.NoBody)
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("id", response.ID)
			getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, rctx))
			getRec := httptest.NewRecorder()
			getHandler(getRec, getReq)

			if getRec.Code != http.StatusOK {
				errors <- fmt.Errorf("worker %d: get failed with status %d", index, getRec.Code)
			}
		}(i)
	}

	// Wait for all workers
	for i := 0; i < numWorkers; i++ {
		<-done
	}
	close(errors)

	// Check for errors
	for err := range errors {
		t.Error(err)
	}

	// Verify all documents were created
	if len(store.documents) != numWorkers {
		t.Errorf("Expected %d documents, got %d", numWorkers, len(store.documents))
	}
}

func TestHandleCreate_ReadBodyError(t *testing.T) {
	store := newMockStore()
	handler := HandleCreate(store)

	// Create a reader that fails
	failingReader := &failingReader{err: fmt.Errorf("read error")}
	req := httptest.NewRequest(http.MethodPost, "/api/v2/post/", failingReader)
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusInternalServerError)
	}
}

// failingReader is a reader that always fails
type failingReader struct {
	err error
}

func (f *failingReader) Read(p []byte) (n int, err error) {
	return 0, f.err
}

func TestResponseFormat(t *testing.T) {
	store := newMockStore()
	handler := HandleCreate(store)

	req := httptest.NewRequest(http.MethodPost, "/api/v2/post/", strings.NewReader("test"))
	rec := httptest.NewRecorder()

	handler(rec, req)

	// Check Content-Type header
	contentType := rec.Header().Get("Content-Type")
	if !strings.Contains(contentType, "application/json") {
		t.Errorf("Content-Type mismatch: got %q, want JSON", contentType)
	}

	// Verify response is valid JSON
	var response DocumentCreateResponse
	err := json.NewDecoder(rec.Body).Decode(&response)
	if err != nil {
		t.Errorf("Response is not valid JSON: %v", err)
	}
}
