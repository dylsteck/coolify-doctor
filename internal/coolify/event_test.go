package coolify

import (
	"encoding/json"
	"testing"
)

func TestEvent_Unmarshal(t *testing.T) {
	raw := `{"success":true,"message":"m","event":"deployment_success","application_name":"app","project":"p"}`
	var e Event
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		t.Fatal(err)
	}
	if e.Event != "deployment_success" || e.ApplicationName != "app" || e.Project != "p" {
		t.Fatalf("%+v", e)
	}
}
