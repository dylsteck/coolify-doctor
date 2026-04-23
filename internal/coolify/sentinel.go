package coolify

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
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

// History fetches samples of `kind` (cpu, memory) since `since`.
//
// Sentinel responses:
//   - `time` is an int64 Unix timestamp (seconds)
//   - value field varies by kind: `percent` (cpu), `usedPercent` (memory/disk)
//
// We tolerate other shapes seen across Sentinel versions by trying several
// value field names.
func (s *SentinelClient) History(ctx context.Context, kind string, since time.Time) ([]Sample, error) {
	path := fmt.Sprintf("/api/%s/history?from=%s", kind, since.UTC().Format("2006-01-02T15:04:05Z"))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.Token)
	req.Header.Set("Accept", "application/json")

	resp, err := s.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sentinel %s: %w", path, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		snippet := string(body)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, fmt.Errorf("sentinel %s: %s (%s)", path, resp.Status, snippet)
	}

	var raw []map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("decode %s: %w", path, err)
	}

	valueKeys := valueFieldPreference(kind)
	out := make([]Sample, 0, len(raw))
	for _, m := range raw {
		t, ok := extractTime(m)
		if !ok {
			continue
		}
		v, ok := firstFloat(m, valueKeys...)
		if !ok {
			continue
		}
		out = append(out, Sample{Time: t, Value: v})
	}
	if len(out) == 0 && len(raw) > 0 {
		// Samples came back but we didn't recognize them. Surface the shape so
		// the operator can diagnose.
		return nil, fmt.Errorf("sentinel %s: %d samples but no recognizable fields (first=%v)", kind, len(raw), raw[0])
	}
	return out, nil
}

// Latest returns the most recent sample from the last 90 seconds.
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

// valueFieldPreference returns candidate JSON keys for the numeric sample
// value, in the order Sentinel is most likely to use them for a given kind.
func valueFieldPreference(kind string) []string {
	switch kind {
	case "cpu":
		return []string{"percent", "usedPercent", "value", "v", "usage"}
	case "memory":
		return []string{"usedPercent", "percent", "value", "v", "usage", "used"}
	}
	return []string{"value", "percent", "usedPercent", "v"}
}

func extractTime(m map[string]any) (time.Time, bool) {
	for _, k := range []string{"time", "timestamp", "t", "created_at"} {
		v, ok := m[k]
		if !ok {
			continue
		}
		switch x := v.(type) {
		case float64:
			sec := int64(x)
			nsec := int64((x - float64(sec)) * 1e9)
			return time.Unix(sec, nsec), true
		case string:
			if t, ok := parseTimeString(x); ok {
				return t, true
			}
		}
	}
	return time.Time{}, false
}

// parseTimeString handles Sentinel's documented format: Unix milliseconds as a
// decimal string (e.g. "1700000000000"), plus RFC3339 and layout fallbacks.
func parseTimeString(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	if len(s) >= 10 && len(s) <= 15 {
		allDigit := true
		for i := 0; i < len(s); i++ {
			if s[i] < '0' || s[i] > '9' {
				allDigit = false
				break
			}
		}
		if allDigit {
			n, err := strconv.ParseInt(s, 10, 64)
			if err == nil {
				if n >= 1_000_000_000_000 {
					return time.UnixMilli(n), true
				}
				return time.Unix(n, 0), true
			}
		}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
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
		case string:
			if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
				return f, true
			}
		}
	}
	return 0, false
}
