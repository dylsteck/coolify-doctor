package coolify

import "encoding/json"

// Event is a superset of every Coolify webhook payload shape. All notifications
// share `success`, `message`, `event`, plus event-specific fields; we decode
// into one struct rather than branching on typed structs per event.
type Event struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Event   string `json:"event"`

	// Deployment / status_changed
	ApplicationName string `json:"application_name,omitempty"`
	ApplicationUUID string `json:"application_uuid,omitempty"`
	DeploymentUUID  string `json:"deployment_uuid,omitempty"`
	DeploymentURL   string `json:"deployment_url,omitempty"`
	Project         string `json:"project,omitempty"`
	Environment     string `json:"environment,omitempty"`
	PullRequestID   any    `json:"pull_request_id,omitempty"`
	PreviewFQDN     string `json:"preview_fqdn,omitempty"`
	FQDN            string `json:"fqdn,omitempty"`
	URL             string `json:"url,omitempty"`

	// Backup
	DatabaseName string `json:"database_name,omitempty"`
	DatabaseUUID string `json:"database_uuid,omitempty"`
	DatabaseType string `json:"database_type,omitempty"`
	Frequency    string `json:"frequency,omitempty"`
	ErrorOutput  string `json:"error_output,omitempty"`

	// Scheduled task
	TaskName    string `json:"task_name,omitempty"`
	TaskUUID    string `json:"task_uuid,omitempty"`
	Output      string `json:"output,omitempty"`
	ServiceUUID string `json:"service_uuid,omitempty"`

	// Server
	ServerName string          `json:"server_name,omitempty"`
	ServerUUID string          `json:"server_uuid,omitempty"`
	DiskUsage  any             `json:"disk_usage,omitempty"`
	Servers    json.RawMessage `json:"servers,omitempty"`
}
