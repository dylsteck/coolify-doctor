FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/coolify-doctor .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget
COPY --from=build /out/coolify-doctor /usr/local/bin/coolify-doctor
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/usr/local/bin/coolify-doctor"]
