package router

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// WSAuthMiddleware authenticates WebSocket connections by reading the token
// from the query parameter (since browsers can't send custom headers during
// WebSocket handshake). This avoids import cycles with the middleware package.
func WSAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// First check if already authenticated (e.g., via cookie/session)
		userID := c.GetInt("id")
		if userID > 0 {
			c.Next()
			return
		}

		// Try to get token from query parameter
		token := c.Query("token")
		if token == "" {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}

		// Parse and validate the token
		identity, internal, err := service.ParseDashboardAccessToken(token)
		if err != nil {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}

		var user *model.UserBase
		if internal {
			// Session-based authentication
			_, user, err = service.ValidateLoginSession(identity)
			if err != nil || user == nil {
				c.AbortWithStatus(http.StatusUnauthorized)
				return
			}
		} else {
			// PAT-based authentication
			ref := model.AccessTokenFingerprint(token)
			accessToken, err := model.FindUserAccessTokenByHash(ref)
			if err != nil || accessToken == nil {
				c.AbortWithStatus(http.StatusUnauthorized)
				return
			}
			if accessToken.Expired(common.GetTimestamp()) {
				c.AbortWithStatus(http.StatusUnauthorized)
				return
			}
			user, err = model.GetUserCache(accessToken.UserId)
			if err != nil || user == nil {
				c.AbortWithStatus(http.StatusUnauthorized)
				return
			}
		}

		if user.Status != common.UserStatusEnabled {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}

		// Set user context
		c.Set("id", user.Id)
		c.Set("role", user.Role)
		c.Set("username", user.Username)
		c.Set("group", user.Group)
		c.Set("user_group", user.Group)

		c.Next()
	}
}