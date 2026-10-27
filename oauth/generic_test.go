package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeEndpointURL(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "no trailing slash", in: "https://idp.example/oauth/token", want: "https://idp.example/oauth/token"},
		{name: "one trailing slash", in: "https://idp.example/oauth/token/", want: "https://idp.example/oauth/token"},
		{name: "many trailing slashes", in: "https://idp.example/oauth/token///", want: "https://idp.example/oauth/token"},
		{name: "surrounding whitespace", in: "  https://idp.example/oauth/token  ", want: "https://idp.example/oauth/token"},
		{name: "whitespace and trailing slash", in: "\thttps://idp.example/oauth/token/\n", want: "https://idp.example/oauth/token"},
		{name: "host with trailing slash", in: "https://idp.example/", want: "https://idp.example"},
		{name: "empty", in: "", want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, normalizeEndpointURL(tc.in))
		})
	}
}

// TestGenericProviderRequestsNormalizedEndpoints proves the operator can paste
// an endpoint with or without a trailing slash and the provider still reaches
// the intended path: a "/" left on the configured endpoint would otherwise
// produce a double slash that many identity providers reject.
func TestGenericProviderRequestsNormalizedEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const providerUserBody = `{"sub":"norm-user","preferred_username":"norm"}`

	var tokenPath, userInfoPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/oauth/token":
			tokenPath = r.URL.Path
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"token-value","token_type":"Bearer"}`))
		case "/oauth/userinfo":
			userInfoPath = r.URL.Path
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(providerUserBody))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := NewGenericOAuthProvider(&model.CustomOAuthProvider{
		Name:             "Normalized",
		Slug:             "normalized",
		Enabled:          true,
		TokenEndpoint:    server.URL + "/oauth/token/",
		UserInfoEndpoint: server.URL + "/oauth/userinfo//",
		UserIdField:      "sub",
		UsernameField:    "preferred_username",
	})

	ctx := context.Background()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/api/oauth/normalized", nil)

	token, err := provider.ExchangeToken(ctx, "auth-code", c)
	require.NoError(t, err)
	require.NotNil(t, token)
	assert.Equal(t, "token-value", token.AccessToken)
	assert.Equal(t, "/oauth/token", tokenPath, "configured token endpoint must lose its trailing slash")

	user, err := provider.GetUserInfo(ctx, token)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "norm-user", user.ProviderUserID)
	assert.Equal(t, "/oauth/userinfo", userInfoPath, "configured user info endpoint must lose its trailing slashes")
}
