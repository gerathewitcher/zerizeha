LOCAL_BIN:=$(CURDIR)/bin
OAPI_BIN:=$(LOCAL_BIN)/oapi-codegen
OPENAPI_SPEC:=./docs/openapi.yaml
OAPI_CONFIG:=./oapi-codegen.yaml

include .env

install-deps:
	GOBIN=$(LOCAL_BIN) go install github.com/pressly/goose/v3/cmd/goose@v3.26.0
	GOBIN=$(LOCAL_BIN) go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.5.1

.PHONY: test
test:
	go clean -testcache
	go test ./... -count 3

.PHONY: test-coverage

test-coverage:
	go clean -testcache
	go test ./... -coverprofile-coverage.tmp.out -covermode count -coverpkg=github.com/gerathewitcher/healthstyle/nutrition/internal/service/...,github.com/gerathewitcher/healthstyle/nutrition/internal/api/... -count 5 -v
	grep -v 'mocks\|config' coverage.tmp.out > coverage.out
	rm coverage.tmp.out
	go tool cover -html=coverage.out;
	go tool cover -func=./coverage.out | grep "total";
	grep -sqFx "/coverage.out" .gitignore || echo "/coverage.out" >> .gitignore


local-migrations-status:
	$(LOCAL_BIN)/goose -dir ${MIGRATIONS_DIR} postgres ${PG_DSN} status -v

local-migration-create:
	$(LOCAL_BIN)/goose -dir ${MIGRATIONS_DIR} create ${MIGRATION_NAME} sql

local-migration-up:
	$(LOCAL_BIN)/goose -dir ${MIGRATIONS_DIR} postgres ${PG_DSN} up -v

local-migration-down:
	$(LOCAL_BIN)/goose -dir ${MIGRATIONS_DIR} postgres ${PG_DSN} down -v

.PHONY: openapi
openapi:
	$(OAPI_BIN) --config $(OAPI_CONFIG) $(OPENAPI_SPEC)
