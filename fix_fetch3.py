with open('/tmp/original_channel_upstream_update.go', 'r') as f:
    content = f.read()

# Find the start of fetchChannelUpstreamModelIDs
start = content.find('func fetchChannelUpstreamModelIDs(channel *model.Channel) ([]string, error) {')
# Find the next function after it
end = content.find('func fetchAdvancedCustomUpstreamModelIDs')

new_func = r'''// fetchChannelUpstreamModels fetches models with full metadata from upstream provider
func fetchChannelUpstreamModels(channel *model.Channel) ([]dto.UpstreamModelInfo, error) {
	if channel.Type == constant.ChannelTypeTaskPlugin {
		plugin, ok := jsplugin.DefaultRegistry.Get(channel.GetSetting().TaskPluginKey)
		if !ok {
			return nil, fmt.Errorf("task plugin %q is not registered", channel.GetSetting().TaskPluginKey)
		}
		return lo.Map(plugin.Meta.Models, func(name string, _ int) dto.UpstreamModelInfo {
			return dto.UpstreamModelInfo{ID: name, Object: "model"}
		}), nil
	}
	baseURL := constant.GetChannelBaseURL(channel.Type)
	if channel.GetBaseURL() != "" {
		baseURL = channel.GetBaseURL()
	}

	if channel.Type == constant.ChannelTypeOllama {
		key := strings.TrimSpace(strings.Split(channel.Key, "\n")[0])
		models, err := ollama.FetchOllamaModels(baseURL, key)
		if err != nil {
			return nil, err
		}
		return lo.Map(models, func(item ollama.OllamaModel, _ int) dto.UpstreamModelInfo {
			return dto.UpstreamModelInfo{
				ID:          item.Name,
				Object:      "model",
				Size:        item.Size,
				Digest:      item.Digest,
				ModifiedAt:  item.ModifiedAt,
				Details: &dto.ModelDetails{
					ParentModel:       item.Details.ParentModel,
					Format:            item.Details.Format,
					Family:            item.Details.Family,
					Families:          item.Details.Families,
					ParameterSize:     item.Details.ParameterSize,
					QuantizationLevel: item.Details.QuantizationLevel,
				},
				ProviderSpecific: map[string]any{
					"format":             item.Details.Format,
					"family":             item.Details.Family,
					"families":           item.Details.Families,
					"parameter_size":     item.Details.ParameterSize,
					"quantization_level": item.Details.QuantizationLevel,
				},
			}
		}), nil
	}

	if channel.Type == constant.ChannelTypeGemini {
		key, _, apiErr := channel.GetNextEnabledKey()
		if apiErr != nil {
			return nil, fmt.Errorf("failed to get channel key: %w", apiErr)
		}
		key = strings.TrimSpace(key)
		models, err := gemini.FetchGeminiModelsWithMetadata(baseURL, key, channel.GetSetting())
		if err != nil {
			return nil, err
		}
		return models, nil
	}

	if constant.IsAdvancedCustomChannel(channel.Type) {
		ids, err := fetchAdvancedCustomUpstreamModelIDs(channel, baseURL)
		if err != nil {
			return nil, err
		}
		return lo.Map(ids, func(id string, _ int) dto.UpstreamModelInfo {
			return dto.UpstreamModelInfo{ID: id, Object: "model"}
		}), nil
	}

	if channel.Type == constant.ChannelTypeCodex {
		ids, err := service.FetchCodexChannelModels(channel)
		if err != nil {
			return nil, err
		}
		return lo.Map(ids, func(id string, _ int) dto.UpstreamModelInfo {
			return dto.UpstreamModelInfo{ID: id, Object: "model"}
		}), nil
	}

	var url string
	switch channel.Type {
	case constant.ChannelTypeAli:
		url = fmt.Sprintf("%s/compatible-mode/v1/models", baseURL)
	case constant.ChannelTypeZhipu_v4:
		if plan, ok := constant.ChannelSpecialBases[baseURL]; ok && plan.OpenAIBaseURL != "" {
			url = fmt.Sprintf("%s/models", plan.OpenAIBaseURL)
		} else {
			url = fmt.Sprintf("%s/api/paas/v4/models", baseURL)
		}
	case constant.ChannelTypeVolcEngine:
		// 火山方舟 OpenAI 兼容 API 根路径是 /api/v3（chat/embeddings 均为
		// {base}/api/v3/...，见 relay/channel/volcengine 的 GetRequestURL），
		// не существует /v1/models 端点。原拼接会导致「获取模型列表」固定 404 失败。
		if plan, ok := constant.ChannelSpecialBases[baseURL]; ok && plan.OpenAIBaseURL != "" {
			url = fmt.Sprintf("%s/v1/models", plan.OpenAIBaseURL)
		} else {
			url = fmt.Sprintf("%s/api/v3/models", baseURL)
		}
	case constant.ChannelTypeMoonshot:
		if plan, ok := constant.ChannelSpecialBases[baseURL]; ok && plan.OpenAIBaseURL != "" {
			url = fmt.Sprintf("%s/models", plan.OpenAIBaseURL)
		} else {
			url = fmt.Sprintf("%s/v1/models", baseURL)
		}
	default:
		url = fmt.Sprintf("%s/v1/models", baseURL)
	}

	key, _, apiErr := channel.GetNextEnabledKey()
	if apiErr != nil {
		return nil, fmt.Errorf("failed to get channel key: %w", apiErr)
	}
	key = strings.TrimSpace(key)

	headers, err := buildFetchModelsHeaders(channel, key)
	if err != nil {
		return nil, sanitizeFetchModelsError(err, key)
	}

	body, err := getFetchModelsResponseBody(http.MethodGet, url, channel, headers)
	if err != nil {
		return nil, sanitizeAdvancedCustomRequestError(err, key, url)
	}

	var result OpenAIModelsResponse
	if err := common.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return lo.Map(result.Data, func(item OpenAIModel, _ int) dto.UpstreamModelInfo {
		id := item.ID
		if channel.Type == constant.ChannelTypeGemini {
			id = strings.TrimPrefix(item.ID, "models/")
		}
		return dto.UpstreamModelInfo{
			ID:           id,
			Object:       item.Object,
			Created:      item.Created,
			OwnedBy:      item.OwnedBy,
			Metadata:     item.Metadata,
			ProviderSpecific: map[string]any{
				"root":   item.Root,
				"parent": item.Parent,
			},
		}
	}), nil
}

func fetchChannelUpstreamModelIDs(channel *model.Channel) ([]string, error) {
	models, err := fetchChannelUpstreamModels(channel)
	if err != nil {
		return nil, err
	}
	ids := lo.Map(models, func(m dto.UpstreamModelInfo, _ int) string {
		return m.ID
	})
	return normalizeModelNames(ids), nil
}


'''

content = content[:start] + new_func + content[end:]
with open('controller/channel_upstream_update.go', 'w') as f:
    f.write(content)
print('Done')