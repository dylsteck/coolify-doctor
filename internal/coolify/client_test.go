package coolify

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResource_OwningProjectUUID(t *testing.T) {
	r := Resource{ProjectUUID: "a"}
	if r.OwningProjectUUID() != "a" {
		t.Error("flat uuid")
	}
	p := &struct {
		UUID string `json:"uuid"`
		Name string `json:"name"`
	}{UUID: "b"}
	r = Resource{Project: p}
	if r.OwningProjectUUID() != "b" {
		t.Error("nested")
	}
	r = Resource{}
	if r.OwningProjectUUID() != "" {
		t.Error("empty")
	}
}

func TestClient_ListProjects(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/projects" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer tok" {
			t.Error("missing bearer")
		}
		_, _ = w.Write([]byte(`[{"id":1,"uuid":"u","name":"N"}]`))
	}))
	t.Cleanup(srv.Close)

	c := NewClient(srv.URL, "tok")
	c.HTTP = srv.Client()
	ctx := context.Background()
	list, err := c.ListProjects(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != "N" {
		t.Fatalf("got %#v", list)
	}
}

func TestClient_GetJSON_403(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"nope":1}`, http.StatusForbidden)
	}))
	t.Cleanup(srv.Close)
	c := NewClient(srv.URL, "tok")
	c.HTTP = srv.Client()
	_, err := c.ListProjects(context.Background())
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestClient_GetJSON_InvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`not-json`))
	}))
	t.Cleanup(srv.Close)
	c := NewClient(srv.URL, "tok")
	c.HTTP = srv.Client()
	_, err := c.ListProjects(context.Background())
	if err == nil {
		t.Fatal("expected decode error")
	}
}

func TestClient_ListResources(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/resources" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[{"uuid":"u","name":"R","type":"app","status":"ok"}]`))
	}))
	t.Cleanup(srv.Close)
	c := NewClient(srv.URL, "tok")
	c.HTTP = srv.Client()
	list, err := c.ListResources(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != "R" {
		t.Fatalf("%#v", list)
	}
}
