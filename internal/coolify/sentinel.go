package coolify

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type SentinelClient struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func NewSentinelClient(baseURL, token string) *SentinelClient {
	return &SentinelClient{
		BaseURL: baseURL,
		Token:   token,
		HTTP:    &http.Client{Timeout: 10 * time.Second},
	}
}

type Sample struct {
	Time  time.Time
	Value float64
}

// History fetches samples of `kind` (cpu, memory, disk) since `since`.
// Samples are returned in the order Sentinel provides them (oldest → newest).
func (s *SentinelClient) History(ctx context.Context, kind string, since time.Time) ([]Sample, error) {
	path := fmt.Sprintf("/api/%s/history?from=%s", kind, since.UTC().Format(time.RFC3339))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.Token)
	req.Header.Set("Accept", "application/json")

	resp, err := s.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("sentinel %s: %s", path, resp.Status)
	}

	// Sentinel responses vary across versions; accept common shapes and
	// normalize to []Sample. Known shapes:
	//   [{"time":"...","value":34.2}, ...]
	//   [{"timestamp":"...","percent":34.2}, ...]
	//   [{"t":"...","v":34.2}, ...]
	var raw []map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("decode %s: %w", path, err)
	}

	out := make([]Sample, 0, len(raw))
	for _, m := range raw {
		t, ok := parseTime(firstString(m, "time", "timestamp", "t", "created_at"))
		if !ok {
			continue
		}
		v, ok := firstFloat(m, "value", "percent", "v", "usage")
		if !ok {
			continue
		}
		out = append(out, Sample{Time: t, Value: v})
	}
	return out, nil
}

// Latest is a thin wrapper returning just the most recent sample from the last
// 90 seconds; useful for "right now" readings.
func (s *SentinelClient) Latest(ctx context.Context, kind string) (Sample, error) {
	samples, err := s.History(ctx, kind, time.Now().Add(-90*time.Second))
	if err != nil {
		return Sample{}, err
	}
	if len(samples) == 0 {
		return Sample{}, fmt.Errorf("sentinel %s: no recent samples", kind)
	}
	return samples[len(samples)-1], nil
}

func parseTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

func firstFloat(m map[string]any, keys ...string) (float64, bool) {
	for _, k := range keys {
		switch v := m[k].(type) {
		case float64:
			return v, true
		case json.Number:
			if f, err := v.Float64(); err == nil {
				return f, true
			}
		}
	}
	return 0, false
}
