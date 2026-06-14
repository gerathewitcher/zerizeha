package mail

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"html"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"

	"zerizeha/internal/config"
)

var ErrNotConfigured = errors.New("email delivery is not configured")

// Message describes one transactional email to send.
type Message struct {
	To       string
	Subject  string
	TextBody string
	HTMLBody string
}

// Service sends transactional emails.
type Service interface {
	Send(ctx context.Context, message Message) error
	SendPasswordSetup(ctx context.Context, to string, setupURL string) error
	SendEmailConfirmation(ctx context.Context, to string, confirmationURL string) error
}

type serviceImpl struct {
	cfg config.EmailConfig
}

// NewService constructs an SMTP-backed email service.
func NewService(cfg config.EmailConfig) Service {
	return &serviceImpl{cfg: cfg}
}

// Send sends a transactional email using the configured SMTP server.
func (s *serviceImpl) Send(ctx context.Context, message Message) error {
	if !s.cfg.Enabled() {
		return ErrNotConfigured
	}

	if err := validateMessage(message); err != nil {
		return err
	}

	client, err := s.smtpClient(ctx)
	if err != nil {
		return err
	}
	defer client.Close()

	if err := client.Auth(smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}
	if err := client.Mail(s.cfg.FromEmail); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := client.Rcpt(message.To); err != nil {
		return fmt.Errorf("smtp recipient: %w", err)
	}

	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := writer.Write(buildMessage(s.cfg, message)); err != nil {
		_ = writer.Close()
		return fmt.Errorf("smtp write message: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("smtp close message: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("smtp quit: %w", err)
	}
	return nil
}

// SendPasswordSetup sends a password setup link to an existing user.
func (s *serviceImpl) SendPasswordSetup(ctx context.Context, to string, setupURL string) error {
	setupURL = strings.TrimSpace(setupURL)
	if setupURL == "" {
		return errors.New("setup url is required")
	}

	return s.Send(ctx, Message{
		To:      to,
		Subject: "Вход в Zerizeha: установка пароля",
		TextBody: strings.Join([]string{
			"Чтобы установить пароль для Zerizeha, откройте ссылку:",
			setupURL,
			"",
			"Если вы не запрашивали это письмо, просто проигнорируйте его.",
		}, "\n"),
		HTMLBody: fmt.Sprintf(
			`<p>Чтобы установить пароль для Zerizeha, откройте ссылку:</p><p><a href="%[1]s">%[1]s</a></p><p>Если вы не запрашивали это письмо, просто проигнорируйте его.</p>`,
			html.EscapeString(setupURL),
		),
	})
}

// SendEmailConfirmation sends an account confirmation link to a new user.
func (s *serviceImpl) SendEmailConfirmation(ctx context.Context, to string, confirmationURL string) error {
	confirmationURL = strings.TrimSpace(confirmationURL)
	if confirmationURL == "" {
		return errors.New("confirmation url is required")
	}

	return s.Send(ctx, Message{
		To:      to,
		Subject: "Zerizeha: подтверждение регистрации",
		TextBody: strings.Join([]string{
			"Чтобы подтвердить регистрацию в Zerizeha, откройте ссылку:",
			confirmationURL,
			"",
			"Если вы не регистрировались в Zerizeha, просто проигнорируйте это письмо.",
		}, "\n"),
		HTMLBody: fmt.Sprintf(
			`<p>Чтобы подтвердить регистрацию в Zerizeha, откройте ссылку:</p><p><a href="%[1]s">%[1]s</a></p><p>Если вы не регистрировались в Zerizeha, просто проигнорируйте это письмо.</p>`,
			html.EscapeString(confirmationURL),
		),
	})
}

func (s *serviceImpl) smtpClient(ctx context.Context) (*smtp.Client, error) {
	address := net.JoinHostPort(s.cfg.Host, fmt.Sprintf("%d", s.cfg.Port))
	dialer := &net.Dialer{Timeout: 10 * time.Second}

	var conn net.Conn
	var err error
	if s.cfg.UseTLS && s.cfg.Port == 465 {
		conn, err = tls.DialWithDialer(dialer, "tcp", address, &tls.Config{
			MinVersion: tls.VersionTLS12,
			ServerName: s.cfg.Host,
		})
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", address)
	}
	if err != nil {
		return nil, fmt.Errorf("smtp dial: %w", err)
	}

	client, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("smtp client: %w", err)
	}

	if s.cfg.UseTLS && s.cfg.Port != 465 {
		if err := client.StartTLS(&tls.Config{
			MinVersion: tls.VersionTLS12,
			ServerName: s.cfg.Host,
		}); err != nil {
			_ = client.Close()
			return nil, fmt.Errorf("smtp starttls: %w", err)
		}
	}

	return client, nil
}

func validateMessage(message Message) error {
	if strings.TrimSpace(message.To) == "" {
		return errors.New("recipient is required")
	}
	if _, err := mail.ParseAddress(message.To); err != nil {
		return fmt.Errorf("recipient is invalid: %w", err)
	}
	if strings.TrimSpace(message.Subject) == "" {
		return errors.New("subject is required")
	}
	if strings.TrimSpace(message.TextBody) == "" && strings.TrimSpace(message.HTMLBody) == "" {
		return errors.New("message body is required")
	}
	return nil
}

func buildMessage(cfg config.EmailConfig, message Message) []byte {
	headers := textproto.MIMEHeader{}
	headers.Set("From", (&mail.Address{Name: cfg.FromName, Address: cfg.FromEmail}).String())
	headers.Set("To", message.To)
	headers.Set("Subject", mime.QEncoding.Encode("utf-8", message.Subject))
	headers.Set("MIME-Version", "1.0")

	var body bytes.Buffer
	if message.HTMLBody == "" {
		headers.Set("Content-Type", `text/plain; charset="utf-8"`)
		headers.Set("Content-Transfer-Encoding", "8bit")
		body.WriteString(normalizeNewlines(message.TextBody))
	} else {
		boundary := "zerizeha-mail-boundary"
		headers.Set("Content-Type", `multipart/alternative; boundary="`+boundary+`"`)
		writePart(&body, boundary, "text/plain", message.TextBody)
		writePart(&body, boundary, "text/html", message.HTMLBody)
		body.WriteString("--" + boundary + "--\r\n")
	}

	var raw bytes.Buffer
	for key, values := range headers {
		for _, value := range values {
			raw.WriteString(key)
			raw.WriteString(": ")
			raw.WriteString(value)
			raw.WriteString("\r\n")
		}
	}
	raw.WriteString("\r\n")
	raw.Write(body.Bytes())
	return raw.Bytes()
}

func writePart(body *bytes.Buffer, boundary string, contentType string, content string) {
	body.WriteString("--" + boundary + "\r\n")
	body.WriteString("Content-Type: " + contentType + `; charset="utf-8"` + "\r\n")
	body.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	body.WriteString(normalizeNewlines(content))
	body.WriteString("\r\n")
}

func normalizeNewlines(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	return strings.ReplaceAll(value, "\n", "\r\n")
}
