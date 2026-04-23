package webhook

import (
	"strings"
	"testing"

	"github.com/dylsteck/coolify-doctor/internal/coolify"
)

func TestFormat_Deployment(t *testing.T) {
	e := coolify.Event{Success: true, Event: "deployment_success", ApplicationName: "A", Project: "P", Message: "ok", DeploymentURL: "https://d.example"}
	s := Format(e, nil)
	if !strings.Contains(s, "Deployment") || !strings.Contains(s, "A") {
		t.Fatalf("%s", s)
	}
}

func TestFormat_Unknown(t *testing.T) {
	e := coolify.Event{Event: "custom_event", Message: "msg"}
	raw := []byte(`{"x":1,"event":"custom_event"}`)
	s := Format(e, raw)
	if !strings.Contains(s, "custom_event") {
		t.Fatalf("should include event: %s", s)
	}
}

func TestFormat_Test(t *testing.T) {
	e := coolify.Event{Success: true, Event: "test", Message: "hello <user>"}
	s := Format(e, nil)
	if !strings.Contains(s, "Test webhook") {
		t.Fatal(s)
	}
	if !strings.Contains(s, "hello &lt;user&gt;") {
		t.Fatal("message should be escaped in HTML", s)
	}
}

func TestFormat_Task(t *testing.T) {
	e := coolify.Event{Success: false, Event: "task_failed", TaskName: "t", URL: "https://u", Message: "m"}
	s := Format(e, nil)
	if !strings.Contains(s, "task") {
		t.Fatal(s)
	}
}

func TestOrDefault(t *testing.T) {
	if orDefault("", "d") != "d" {
		t.Error("default")
	}
	if orDefault("a", "d") != "a" {
		t.Error("value")
	}
}
