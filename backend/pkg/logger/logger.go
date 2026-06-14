package logger

import (
	"log/slog"
)

var globalLogger *slog.Logger

func Init(handler slog.Handler) {
	globalLogger = slog.New(handler)

}

func logger() *slog.Logger {
	if globalLogger == nil {
		return slog.Default()
	}
	return globalLogger
}

func Debug(msg string, fields ...any) {

	logger().Debug(msg, fields...)
}

func Info(msg string, fields ...any) {
	logger().Info(msg, fields...)
}

func Warn(msg string, fields ...any) {
	logger().Warn(msg, fields...)
}

func Error(msg string, fields ...any) {
	logger().Error(msg, fields...)
}
