package telegram

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/dylsteck/coolify-doctor/internal/coolify"
)

// Handlers owns the clients needed by read-only commands. Any client may be
// nil if the operator didn't configure the matching env vars; the relevant
// command will respond with a "not configured" message in that case.
type Handlers struct {
	Coolify  *coolify.Client
	Sentinel *coolify.SentinelClient
}

func (h *Handlers) Register(b *bot.Bot) {
	b.RegisterHandler(bot.HandlerTypeMessageText, "projects", bot.MatchTypeCommand, h.Projects)
	b.RegisterHandler(bot.HandlerTypeMessageText, "resources", bot.MatchTypeCommand, h.Resources)
	b.RegisterHandler(bot.HandlerTypeMessageText, "usage", bot.MatchTypeCommand, h.Usage)
}

// Projects: GET /api/v1/projects → bulleted HTML list.
func (h *Handlers) Projects(ctx context.Context, b *bot.Bot, u *models.Update) {
	if h.Coolify == nil {
		reply(ctx, b, u, "Coolify API not configured; set <code>COOLIFY_URL</code> and <code>COOLIFY_API_TOKEN</code>.")
		return
	}
	projects, err := h.Coolify.ListProjects(ctx)
	if err != nil {
		log.Printf("telegram: /projects: %v", err)
		reply(ctx, b, u, "Failed to fetch projects: "+Esc(err.Error()))
		return
	}
	if len(projects) == 0 {
		reply(ctx, b, u, "No projects found.")
		return
	}
	sort.Slice(projects, func(i, j int) bool { return projects[i].Name < projects[j].Name })

	lines := []string{fmt.Sprintf("<b>Projects (%d)</b>", len(projects))}
	for _, p := range projects {
		row := fmt.Sprintf("• <b>%s</b>", Esc(p.Name))
		if p.Description != "" {
			row += " — " + Esc(p.Description)
		}
		lines = append(lines, row)
	}
	reply(ctx, b, u, strings.Join(lines, "\n"))
}

// Resources: GET /api/v1/resources, grouped by project. Optional first arg
// filters by project name (case-insensitive exact match).
func (h *Handlers) Resources(ctx context.Context, b *bot.Bot, u *models.Update) {
	if h.Coolify == nil {
		reply(ctx, b, u, "Coolify API not configured; set <code>COOLIFY_URL</code> and <code>COOLIFY_API_TOKEN</code>.")
		return
	}
	arg := commandArg(u.Message.Text)

	resources, err := h.Coolify.ListResources(ctx)
	if err != nil {
		log.Printf("telegram: /resources: ListResources: %v", err)
		reply(ctx, b, u, "Failed to fetch resources: "+Esc(err.Error()))
		return
	}
	projects, err := h.Coolify.ListProjects(ctx)
	if err != nil {
		log.Printf("telegram: /resources: ListProjects: %v", err)
		reply(ctx, b, u, "Failed to fetch projects: "+Esc(err.Error()))
		return
	}

	projectByUUID := make(map[string]coolify.Project, len(projects))
	for _, p := range projects {
		projectByUUID[p.UUID] = p
	}

	// Optional filter
	var filterUUID, filterName string
	if arg != "" {
		for _, p := range projects {
			if strings.EqualFold(p.Name, arg) {
				filterUUID = p.UUID
				filterName = p.Name
				break
			}
		}
		if filterUUID == "" {
			reply(ctx, b, u, fmt.Sprintf("No project matches %q.", arg))
			return
		}
		kept := resources[:0]
		for _, r := range resources {
			if r.OwningProjectUUID() == filterUUID {
				kept = append(kept, r)
			}
		}
		resources = kept
	}

	if len(resources) == 0 {
		if filterName != "" {
			reply(ctx, b, u, fmt.Sprintf("No resources in <b>%s</b>.", Esc(filterName)))
		} else {
			reply(ctx, b, u, "No resources found.")
		}
		return
	}

	// Group by project UUID (preserving unknown-project bucket at end).
	grouped := make(map[string][]coolify.Resource)
	var order []string
	for _, r := range resources {
		key := r.OwningProjectUUID()
		if _, seen := grouped[key]; !seen {
			order = append(order, key)
		}
		grouped[key] = append(grouped[key], r)
	}
	sort.Slice(order, func(i, j int) bool {
		return projectByUUID[order[i]].Name < projectByUUID[order[j]].Name
	})

	var header string
	if filterName != "" {
		header = fmt.Sprintf("<b>Resources in %s (%d)</b>", Esc(filterName), len(resources))
	} else {
		header = fmt.Sprintf("<b>Resources (%d)</b>", len(resources))
	}
	lines := []string{header}
	for _, key := range order {
		if filterName == "" {
			name := "(no project)"
			if p, ok := projectByUUID[key]; ok && p.Name != "" {
				name = p.Name
			}
			lines = append(lines, "", fmt.Sprintf("<b>%s</b>", Esc(name)))
		}
		for _, r := range grouped[key] {
			lines = append(lines, "  • "+formatResource(r))
		}
	}
	reply(ctx, b, u, strings.Join(lines, "\n"))
}

// Usage: CPU/memory from Sentinel, optional timeframe arg (default 1m).
func (h *Handlers) Usage(ctx context.Context, b *bot.Bot, u *models.Update) {
	if h.Sentinel == nil {
		reply(ctx, b, u, "Sentinel not configured; set <code>SENTINEL_TOKEN</code>.")
		return
	}
	arg := commandArg(u.Message.Text)
	if arg == "" {
		arg = "1m"
	}
	window, ok := parseTimeframe(arg)
	if !ok {
		reply(ctx, b, u, fmt.Sprintf(
			"Unknown timeframe %q. Supported: %s.",
			arg, strings.Join(supportedTimeframes(), ", "),
		))
		return
	}

	since := time.Now().Add(-window)
	lines := []string{fmt.Sprintf("<b>Server usage (last %s)</b>", arg)}
	// Sentinel exposes host /api/cpu/history and /api/memory/history only (no disk).
	for _, kind := range []string{"cpu", "memory"} {
		line := usageLine(ctx, h.Sentinel, kind, since)
		lines = append(lines, line)
	}
	reply(ctx, b, u, strings.Join(lines, "\n"))
}

func usageLine(ctx context.Context, s *coolify.SentinelClient, kind string, since time.Time) string {
	label := map[string]string{"cpu": "CPU", "memory": "Memory"}[kind]
	samples, err := s.History(ctx, kind, since)
	if err != nil {
		log.Printf("telegram: /usage %s: %v", kind, err)
		return fmt.Sprintf("• %s: unavailable", label)
	}
	if len(samples) == 0 {
		log.Printf("telegram: /usage %s: no samples in window (see sentinel logs for details)", kind)
		return fmt.Sprintf("• %s: unavailable", label)
	}
	now := samples[len(samples)-1].Value
	var sum, peak float64
	for _, sm := range samples {
		sum += sm.Value
		if sm.Value > peak {
			peak = sm.Value
		}
	}
	avg := sum / float64(len(samples))
	return fmt.Sprintf("• %s: %.1f%% now · %.1f%% avg · %.1f%% peak", label, now, avg, peak)
}

// ---- helpers ----

func formatResource(r coolify.Resource) string {
	name := r.Name
	if name == "" {
		name = r.UUID
	}
	parts := []string{fmt.Sprintf("<b>%s</b>", Esc(name))}
	if r.Type != "" {
		parts = append(parts, Esc(r.Type))
	}
	if r.Status != "" {
		parts = append(parts, statusIcon(r.Status)+" "+Esc(r.Status))
	}
	return JoinInline(parts...)
}

func statusIcon(status string) string {
	s := strings.ToLower(status)
	switch {
	case strings.Contains(s, "running"), strings.Contains(s, "healthy"):
		return "🟢"
	case strings.Contains(s, "exited"), strings.Contains(s, "failed"), strings.Contains(s, "unhealthy"):
		return "🔴"
	case strings.Contains(s, "restarting"), strings.Contains(s, "starting"):
		return "🟡"
	}
	return "⚪️"
}

func commandArg(text string) string {
	_, rest, found := strings.Cut(text, " ")
	if !found {
		return ""
	}
	return strings.TrimSpace(rest)
}

func reply(ctx context.Context, b *bot.Bot, u *models.Update, text string) {
	disabled := true
	_, _ = b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID:             u.Message.Chat.ID,
		Text:               text,
		ParseMode:          models.ParseModeHTML,
		LinkPreviewOptions: &models.LinkPreviewOptions{IsDisabled: &disabled},
	})
}

// Supported timeframes for /usage. Kept as a list (rather than a map) so
// the error message lists them in a sensible order.
var timeframes = []struct {
	label string
	d     time.Duration
}{
	{"1m", time.Minute},
	{"5m", 5 * time.Minute},
	{"15m", 15 * time.Minute},
	{"1h", time.Hour},
	{"6h", 6 * time.Hour},
	{"24h", 24 * time.Hour},
}

func parseTimeframe(s string) (time.Duration, bool) {
	for _, tf := range timeframes {
		if tf.label == s {
			return tf.d, true
		}
	}
	return 0, false
}

func supportedTimeframes() []string {
	out := make([]string, len(timeframes))
	for i, tf := range timeframes {
		out[i] = tf.label
	}
	return out
}
