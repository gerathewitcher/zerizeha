package logger

import (
	"log/slog"
)

var globalLogger *slog.Logger

func Init(handler slog.Handler) {
	globalLogger = slog.New(handler)

}

func Debug(msg string, fields ...any) {

	globalLogger.Debug(msg, fields...)
}

func Info(msg string, fields ...any) {
	globalLogger.Info(msg, fields...)
}

func Warn(msg string, fields ...any) {
	globalLogger.Warn(msg, fields...)
}

func Error(msg string, fields ...any) {
	globalLogger.Error(msg, fields...)
}
