package mail

import (
	"context"
	"errors"
	"strings"
	"testing"

	"zerizeha/internal/config"
)

// TestSendReturnsNotConfigured verifies that missing SMTP credentials fail
// before any network connection is attempted.
func TestSendReturnsNotConfigured(t *testing.T) {
	t.Parallel()

	svc := NewService(config.EmailConfig{})

	err := svc.Send(context.Background(), Message{
		To:       "user@example.com",
		Subject:  "Subject",
		TextBody: "Body",
	})

	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("Send() error = %v, want %v", err, ErrNotConfigured)
	}
}

// TestBuildMessageIncludesTextAndHTML verifies the multipart message used for
// password setup links.
func TestBuildMessageIncludesTextAndHTML(t *testing.T) {
	t.Parallel()

	raw := string(buildMessage(config.EmailConfig{
		FromEmail: "no-reply@example.com",
		FromName:  "Zerizeha",
	}, Message{
		To:       "user@example.com",
		Subject:  "Вход в Zerizeha",
		TextBody: "Plain link",
		HTMLBody: "<p>HTML link</p>",
	}))

	for _, want := range []string{
		`From: "Zerizeha" <no-reply@example.com>`,
		"To: user@example.com",
		"Subject: =?utf-8?",
		`Content-Type: multipart/alternative; boundary="zerizeha-mail-boundary"`,
		"Plain link",
		"<p>HTML link</p>",
	} {
		if !strings.Contains(raw, want) {
			t.Fatalf("message does not contain %q:\n%s", want, raw)
		}
	}
}

// TestSendPasswordSetupValidatesURL verifies that setup emails require a link.
func TestSendPasswordSetupValidatesURL(t *testing.T) {
	t.Parallel()

	svc := NewService(config.EmailConfig{})

	err := svc.SendPasswordSetup(context.Background(), "user@example.com", "")

	if err == nil || !strings.Contains(err.Error(), "setup url") {
		t.Fatalf("SendPasswordSetup() error = %v, want setup url validation", err)
	}
}

// TestSendEmailConfirmationValidatesURL verifies that registration
// confirmation emails require a link.
func TestSendEmailConfirmationValidatesURL(t *testing.T) {
	t.Parallel()

	svc := NewService(config.EmailConfig{})

	err := svc.SendEmailConfirmation(context.Background(), "user@example.com", "")

	if err == nil || !strings.Contains(err.Error(), "confirmation url") {
		t.Fatalf("SendEmailConfirmation() error = %v, want confirmation url validation", err)
	}
}
