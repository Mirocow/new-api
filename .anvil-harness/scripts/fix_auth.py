with open('middleware/auth.go', 'r') as f:
    content = f.read()

old = '''func classifyDashboardCredential(c *gin.Context) (*model.UserBase, service.AuthIdentity, dashboardCredentialKind, error) {
	raw, ok := authorizationToken(c.GetHeader("Authorization"))
	if !ok {
		return nil, service.AuthIdentity{}, dashboardCredentialUnmatched, nil
	}
	identity, internal, err := service.ParseDashboardAccessToken(raw)'''

new = '''func classifyDashboardCredential(c *gin.Context) (*model.UserBase, service.AuthIdentity, dashboardCredentialKind, error) {
	// Check Authorization header first
	raw, ok := authorizationToken(c.GetHeader("Authorization"))
	if !ok {
		// For WebSocket connections, token may be passed as query parameter
		// since browsers can't send custom headers during WebSocket handshake
		raw = c.Query("token")
		if raw == "" {
			return nil, service.AuthIdentity{}, dashboardCredentialUnmatched, nil
		}
	}
	identity, internal, err := service.ParseDashboardAccessToken(raw)'''

if old in content:
    content = content.replace(old, new)
    with open('middleware/auth.go', 'w') as f:
        f.write(content)
    print('Fixed!')
else:
    print('Pattern not found')