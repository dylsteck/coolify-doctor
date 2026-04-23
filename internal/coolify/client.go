package coolify

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func NewClient(baseURL, token string) *Client {
	return &Client{
		BaseURL: baseURL,
		Token:   token,
		HTTP:    &http.Client{Timeout: 15 * time.Second},
	}
}

type Project struct {
	ID          int    `json:"id"`
	UUID        string `json:"uuid"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type Resource struct {
	UUID        string `json:"uuid"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	Status      string `json:"status"`
	ProjectUUID string `json:"project_uuid,omitempty"`
	Project     *struct {
		UUID string `json:"uuid"`
		Name string `json:"name"`
	} `json:"project,omitempty"`
}

// OwningProjectUUID reports the project UUID regardless of which serialization
// shape Coolify returned (flat `project_uuid` or nested `project`).
func (r Resource) OwningProjectUUID() string {
	if r.ProjectUUID != "" {
		return r.ProjectUUID
	}
	if r.Project != nil {
		return r.Project.UUID
	}
	return ""
}

func (c *Client) ListProjects(ctx context.Context) ([]Project, error) {
	var out []Project
	if err := c.getJSON(ctx, "/api/v1/projects", &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) ListResources(ctx context.Context) ([]Resource, error) {
	var out []Resource
	if err := c.getJSON(ctx, "/api/v1/resources", &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) getJSON(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		log.Printf("coolify: request %s %s: %v", req.Method, path, err)
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		log.Printf("coolify: read body %s %s: %v", req.Method, path, err)
		return err
	}
	if resp.StatusCode >= 400 {
		snippet := string(body)
		if len(snippet) > 500 {
			snippet = snippet[:500] + "…"
		}
		err := fmt.Errorf("coolify %s %s: %s (%s)", req.Method, path, resp.Status, snippet)
		log.Printf("coolify: %v", err)
		return err
	}
	if err := json.Unmarshal(body, out); err != nil {
		log.Printf("coolify: decode %s: %v (body=%q)", path, err, firstRunes(string(body), 300))
		return fmt.Errorf("decode %s: %w", path, err)
	}
	return nil
}

func firstRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
