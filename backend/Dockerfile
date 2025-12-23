FROM golang:tip AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go install github.com/pressly/goose/v3/cmd/goose@v3.26.0
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/server ./cmd

FROM gcr.io/distroless/base-debian12:nonroot

WORKDIR /app

COPY --from=build /app/bin/server /app/server
COPY --from=build /go/bin/goose /usr/local/bin/goose
COPY --from=build /app/migrations /app/migrations

EXPOSE 8080

ENTRYPOINT ["/app/server"]
