package webhook

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type recordSender struct {
	calls  []string
	err    error
	called int
}

func (r *recordSender) SendHTML(text string) error {
	r.called++
	if r.calls != nil {
		r.calls = append(r.calls, text)
	}
	return r.err
}

func TestHandler_Unauthorized(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle("POST /webhook/{secret}", NewHandler("good", &recordSender{}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	resp, err := http.Post(srv.URL+"/webhook/bad", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status %d", resp.StatusCode)
	}
}

func TestHandler_OKAndSend(t *testing.T) {
	var rec recordSender
	mux := http.NewServeMux()
	mux.Handle("POST /webhook/{secret}", NewHandler("sec", &rec))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	body := `{"success":true,"event":"test","message":"x"}`
	resp, err := http.Post(srv.URL+"/webhook/sec", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	if rec.called != 1 {
		t.Fatalf("expected 1 send, got %d", rec.called)
	}
}

func TestHandler_BadJSONStill200(t *testing.T) {
	var rec recordSender
	mux := http.NewServeMux()
	mux.Handle("POST /webhook/{secret}", NewHandler("sec", &rec))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	resp, err := http.Post(srv.URL+"/webhook/sec", "application/json", strings.NewReader(`not json`))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	if rec.called != 0 {
		t.Fatal("should not call sender on bad json")
	}
}
