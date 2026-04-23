package coolify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
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
	url := s.BaseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		log.Printf("sentinel: new request %s: %v", url, err)
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.Token)
	req.Header.Set("Accept", "application/json")

	resp, err := s.HTTP.Do(req)
	if err != nil {
		log.Printf("sentinel: request %s: %v", url, err)
		return nil, fmt.Errorf("sentinel %s: %w", path, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		log.Printf("sentinel: read body %s: %v", url, err)
		return nil, err
	}
	if resp.StatusCode >= 400 {
		snippet := string(body)
		if len(snippet) > 500 {
			snippet = snippet[:500] + "…"
		}
		err := fmt.Errorf("sentinel %s: %s (%s)", path, resp.Status, snippet)
		log.Printf("sentinel: %v", err)
		return nil, err
	}

	raw, decErr := decodeHistorySamples(body)
	if decErr != nil {
		log.Printf("sentinel: decode %s: %v (body=%q)", path, decErr, firstStringRunes(string(body), 400))
		return nil, fmt.Errorf("decode %s: %w", path, decErr)
	}
	if len(raw) == 0 {
		log.Printf("sentinel: %s: 0 history rows (no samples in time window or collection not started yet)", path)
		return nil, nil
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
	if len(out) == 0 {
		err := fmt.Errorf("sentinel %s: %d rows but no recognizable time/value fields (first=%v)", kind, len(raw), raw[0])
		log.Printf("sentinel: %v", err)
		return nil, err
	}
	return out, nil
}

// decodeHistorySamples accepts a top-level JSON array or an object with a
// common array key (e.g. {"data": [...]}) for compatibility with proxies.
func decodeHistorySamples(body []byte) ([]map[string]any, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil, nil
	}
	switch body[0] {
	case '[':
		var raw []map[string]any
		if err := json.Unmarshal(body, &raw); err != nil {
			return nil, err
		}
		return raw, nil
	case '{':
		var top map[string]json.RawMessage
		if err := json.Unmarshal(body, &top); err != nil {
			return nil, err
		}
		keys := []string{"data", "Data", "items", "result", "history", "samples", "metrics", "rows"}
		for _, k := range keys {
			v, ok := top[k]
			if !ok {
				continue
			}
			var raw []map[string]any
			if err := json.Unmarshal(v, &raw); err != nil {
				continue
			}
			return raw, nil
		}
		var names []string
		for k := range top {
			names = append(names, k)
		}
		return nil, fmt.Errorf("object has no array field in %v (try wrapping list as array at top level)", names)
	case 'n':
		// null
		if string(body) == "null" {
			return nil, nil
		}
	}
	return nil, fmt.Errorf("unexpected JSON (want array or object, got first byte %q)", body[0])
}

func firstStringRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// Latest returns the most recent sample from the last 90 seconds.
func (s *SentinelClient) Latest(ctx context.Context, kind string) (Sample, error) {
	samples, err := s.History(ctx, kind, time.Now().Add(-90*time.Second))
	if err != nil {
		return Sample{}, err
	}
	if len(samples) == 0 {
		err := fmt.Errorf("sentinel %s: no recent samples", kind)
		log.Printf("sentinel: %v", err)
		return Sample{}, err
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
		case int64:
			if x >= 1_000_000_000_000 {
				return time.UnixMilli(x), true
			}
			return time.Unix(x, 0), true
		case int:
			xi := int64(x)
			if xi >= 1_000_000_000_000 {
				return time.UnixMilli(xi), true
			}
			return time.Unix(xi, 0), true
		case json.Number:
			if n, err := x.Int64(); err == nil {
				if n >= 1_000_000_000_000 {
					return time.UnixMilli(n), true
				}
				return time.Unix(n, 0), true
			}
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
		v := m[k]
		switch x := v.(type) {
		case float64:
			return x, true
		case float32:
			return float64(x), true
		case int:
			return float64(x), true
		case int32:
			return float64(x), true
		case int64:
			return float64(x), true
		case json.Number:
			if f, err := x.Float64(); err == nil {
				return f, true
			}
		case string:
			if f, err := strconv.ParseFloat(strings.TrimSpace(x), 64); err == nil {
				return f, true
			}
		}
	}
	return 0, false
}
