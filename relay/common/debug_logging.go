/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see https://www.gnu.org/licenses/.

For commercial licensing, please contact support@quantumnous.com
*/
package common

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/gin-gonic/gin"
)

// DebugLogConfig controls what debug information is logged
type DebugLogConfig struct {
	LogClientRequest   bool // Log incoming client request
	LogUpstreamRequest bool // Log outgoing upstream request
	LogUpstreamResponse bool // Log upstream response
	LogRequestBody     bool // Log request bodies (may contain sensitive data)
	LogResponseBody    bool // Log response bodies (may contain sensitive data)
	MaxBodySize        int  // Maximum body size to log (0 = no limit)
}

// DefaultDebugLogConfig returns the default debug logging configuration
func DefaultDebugLogConfig() DebugLogConfig {
	return DebugLogConfig{
		LogClientRequest:    true,
		LogUpstreamRequest:  true,
		LogUpstreamResponse: true,
		LogRequestBody:      true,
		LogResponseBody:     true,
		MaxBodySize:         1024 * 1024, // 1MB default limit
	}
}

// DebugLogger handles debug logging for relay requests
type DebugLogger struct {
	config DebugLogConfig
}

// NewDebugLogger creates a new debug logger with the given config
func NewDebugLogger(config DebugLogConfig) *DebugLogger {
	return &DebugLogger{config: config}
}

// LogClientRequest logs the incoming client request
func (d *DebugLogger) LogClientRequest(c *gin.Context, info *RelayInfo) {
	if !common.DebugEnabled || !d.config.LogClientRequest {
		return
	}

	var bodyStr string
	if d.config.LogRequestBody {
		bodyStorage, err := common.GetBodyStorage(c)
		if err == nil {
			bodyBytes, err := bodyStorage.Bytes()
			if err == nil && len(bodyBytes) > 0 {
				if d.config.MaxBodySize > 0 && len(bodyBytes) > d.config.MaxBodySize {
					bodyStr = fmt.Sprintf("[TRUNCATED %d bytes] %s", len(bodyBytes), string(bodyBytes[:d.config.MaxBodySize]))
				} else {
					bodyStr = string(bodyBytes)
				}
			}
		}
	}

	// Log headers (sanitize sensitive headers)
	headers := make(map[string]string)
	for k, v := range c.Request.Header {
		if d.isSensitiveHeader(k) {
			headers[k] = "[REDACTED]"
		} else {
			headers[k] = strings.Join(v, ", ")
		}
	}

	logger.LogDebug(c, "=== CLIENT REQUEST ===")
	logger.LogDebug(c, "Method: %s", c.Request.Method)
	logger.LogDebug(c, "URL: %s", SanitizeURLForLog(c.Request.URL.String()))
	logger.LogDebug(c, "Headers: %v", headers)
	if bodyStr != "" {
		logger.LogDebug(c, "Body: %s", bodyStr)
	}
	logger.LogDebug(c, "=== END CLIENT REQUEST ===")
}

// LogUpstreamRequest logs the outgoing upstream request
func (d *DebugLogger) LogUpstreamRequest(c *gin.Context, info *RelayInfo, req *http.Request, body io.Reader) {
	if !common.DebugEnabled || !d.config.LogUpstreamRequest {
		return
	}

	var bodyStr string
	if d.config.LogRequestBody && body != nil {
		bodyBytes, err := io.ReadAll(body)
		if err == nil && len(bodyBytes) > 0 {
			// Re-create the reader for the actual request
			req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			if d.config.MaxBodySize > 0 && len(bodyBytes) > d.config.MaxBodySize {
				bodyStr = fmt.Sprintf("[TRUNCATED %d bytes] %s", len(bodyBytes), string(bodyBytes[:d.config.MaxBodySize]))
			} else {
				bodyStr = string(bodyBytes)
			}
		}
	}

	// Log headers (sanitize sensitive headers)
	headers := make(map[string]string)
	for k, v := range req.Header {
		if d.isSensitiveHeader(k) {
			headers[k] = "[REDACTED]"
		} else {
			headers[k] = strings.Join(v, ", ")
		}
	}

	logger.LogDebug(c, "=== UPSTREAM REQUEST ===")
	logger.LogDebug(c, "Method: %s", req.Method)
	logger.LogDebug(c, "URL: %s", SanitizeURLForLog(req.URL.String()))
	logger.LogDebug(c, "Headers: %v", headers)
	if bodyStr != "" {
		logger.LogDebug(c, "Body: %s", bodyStr)
	}
	logger.LogDebug(c, "=== END UPSTREAM REQUEST ===")
}

// LogUpstreamResponse logs the upstream response
func (d *DebugLogger) LogUpstreamResponse(c *gin.Context, info *RelayInfo, resp *http.Response) {
	if !common.DebugEnabled || !d.config.LogUpstreamResponse {
		return
	}

	var bodyStr string
	if d.config.LogResponseBody && resp != nil && resp.Body != nil {
		bodyBytes, err := io.ReadAll(resp.Body)
		if err == nil && len(bodyBytes) > 0 {
			// Re-create the body for further processing
			resp.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			if d.config.MaxBodySize > 0 && len(bodyBytes) > d.config.MaxBodySize {
				bodyStr = fmt.Sprintf("[TRUNCATED %d bytes] %s", len(bodyBytes), string(bodyBytes[:d.config.MaxBodySize]))
			} else {
				bodyStr = string(bodyBytes)
			}
		}
	}

	// Log headers
	headers := make(map[string]string)
	if resp != nil {
		for k, v := range resp.Header {
			headers[k] = strings.Join(v, ", ")
		}
	}

	logger.LogDebug(c, "=== UPSTREAM RESPONSE ===")
	if resp != nil {
		logger.LogDebug(c, "Status: %d %s", resp.StatusCode, http.StatusText(resp.StatusCode))
		logger.LogDebug(c, "Headers: %v", headers)
		if bodyStr != "" {
			logger.LogDebug(c, "Body: %s", bodyStr)
		}
	} else {
		logger.LogDebug(c, "Response: nil")
	}
	logger.LogDebug(c, "=== END UPSTREAM RESPONSE ===")
}

// isSensitiveHeader checks if a header contains sensitive information
func (d *DebugLogger) isSensitiveHeader(header string) bool {
	lower := strings.ToLower(header)
	sensitiveHeaders := []string{
		"authorization",
		"cookie",
		"set-cookie",
		"x-api-key",
		"x-forwarded-for",
		"proxy-authorization",
		"www-authenticate",
	}
	for _, h := range sensitiveHeaders {
		if lower == h {
			return true
		}
	}
	return false
}

// Global debug logger instance
var globalDebugLogger *DebugLogger

// InitDebugLogger initializes the global debug logger
func InitDebugLogger(config DebugLogConfig) {
	globalDebugLogger = NewDebugLogger(config)
}

// GetDebugLogger returns the global debug logger
func GetDebugLogger() *DebugLogger {
	if globalDebugLogger == nil {
		globalDebugLogger = NewDebugLogger(DefaultDebugLogConfig())
	}
	return globalDebugLogger
}

// LogClientRequest logs the incoming client request using the global logger
func LogClientRequest(c *gin.Context, info *RelayInfo) {
	GetDebugLogger().LogClientRequest(c, info)
}

// LogUpstreamRequest logs the outgoing upstream request using the global logger
func LogUpstreamRequest(c *gin.Context, info *RelayInfo, req *http.Request, body io.Reader) {
	GetDebugLogger().LogUpstreamRequest(c, info, req, body)
}

// LogUpstreamResponse logs the upstream response using the global logger
func LogUpstreamResponse(c *gin.Context, info *RelayInfo, resp *http.Response) {
	GetDebugLogger().LogUpstreamResponse(c, info, resp)
}