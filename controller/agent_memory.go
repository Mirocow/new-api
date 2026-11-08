package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// CreateMemoryBank godoc
// @Summary Create a memory bank
// @Description Create a new isolated memory bank for a user/agent
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param request body object true "bank config"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/banks [post]
func CreateMemoryBank(c *gin.Context) {
	var req struct {
		UserId      int    `json:"user_id" binding:"required"`
		AgentId     string `json:"agent_id"`
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	bank, err := service.CreateMemoryBank(req.UserId, req.AgentId, req.Name, req.Description)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    bank,
	})
}

// ListMemoryBanks godoc
// @Summary List memory banks
// @Description List memory banks for a user
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param user_id query int true "user ID"
// @Param agent_id query string false "agent ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/banks [get]
func ListMemoryBanks(c *gin.Context) {
	userIdStr := c.Query("user_id")
	if userIdStr == "" {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Missing user_id"))
		return
	}
	userId, err := strconv.Atoi(userIdStr)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid user_id"))
		return
	}
	agentId := c.Query("agent_id")
	banks, err := service.ListMemoryBanks(userId, agentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    banks,
	})
}

// GetMemoryBank godoc
// @Summary Get a memory bank
// @Description Get a memory bank by ID
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param id path int true "bank ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/banks/{id} [get]
func GetMemoryBank(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid bank ID"))
		return
	}
	bank, err := service.GetMemoryBank(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    bank,
	})
}

// UpdateMemoryBank godoc
// @Summary Update a memory bank
// @Description Update a memory bank's name/description
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param id path int true "bank ID"
// @Param request body object true "bank config"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/banks/{id} [put]
func UpdateMemoryBank(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid bank ID"))
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	if err := service.UpdateMemoryBank(id, req.Name, req.Description); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Memory bank updated",
	})
}

// DeleteMemoryBank godoc
// @Summary Delete a memory bank
// @Description Delete a memory bank and all its contents
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param id path int true "bank ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/banks/{id} [delete]
func DeleteMemoryBank(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid bank ID"))
		return
	}
	if err := service.DeleteMemoryBank(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Memory bank deleted",
	})
}

// RetainMemory godoc
// @Summary Retain facts from text
// @Description Extract facts from text and store them in a memory bank
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param request body object true "retain request"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/retain [post]
func RetainMemory(c *gin.Context) {
	var req service.MemoryRetainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	resp, err := service.RetainMemory(req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}

// RecallMemory godoc
// @Summary Recall memories
// @Description Search a memory bank for facts, observations and mental models
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param request body object true "recall request"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/recall [post]
func RecallMemory(c *gin.Context) {
	var req service.MemoryRecallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	resp, err := service.RecallMemory(req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}

// ReflectMemory godoc
// @Summary Reflect over memories
// @Description Reason over memories in a bank to answer a question
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param request body object true "reflect request"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/reflect [post]
func ReflectMemory(c *gin.Context) {
	var req service.MemoryReflectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	resp, err := service.ReflectMemory(req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}

// ConsolidateMemory godoc
// @Summary Consolidate memory observations
// @Description Run observation consolidation for a memory bank
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param bank_id query int true "bank ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/consolidate [post]
func ConsolidateMemory(c *gin.Context) {
	bankIdStr := c.Query("bank_id")
	if bankIdStr == "" {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Missing bank_id"))
		return
	}
	bankId, err := strconv.ParseInt(bankIdStr, 10, 64)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid bank_id"))
		return
	}
	if err := service.ConsolidateMemory(bankId); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Consolidation complete",
	})
}

// --- Knowledge Pages ---

// CreateKnowledgePage godoc
// @Summary Create a knowledge page
// @Description Create a knowledge page in a memory bank
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param request body object true "page config"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/knowledge-pages [post]
func CreateKnowledgePage(c *gin.Context) {
	var req struct {
		BankId   int64  `json:"bank_id" binding:"required"`
		Title    string `json:"title" binding:"required"`
		Content  string `json:"content" binding:"required"`
		Path     string `json:"path" binding:"required"`
		ParentId *int64 `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	page, err := model.CreateKnowledgePage(req.BankId, req.Title, req.Content, req.Path, req.ParentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    page,
	})
}

// ListKnowledgePages godoc
// @Summary List knowledge pages
// @Description List knowledge pages for a memory bank
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param bank_id query int true "bank ID"
// @Param path_prefix query string false "path prefix filter"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/knowledge-pages [get]
func ListKnowledgePages(c *gin.Context) {
	bankIdStr := c.Query("bank_id")
	if bankIdStr == "" {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Missing bank_id"))
		return
	}
	bankId, err := strconv.ParseInt(bankIdStr, 10, 64)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid bank_id"))
		return
	}
	pathPrefix := c.Query("path_prefix")
	pages, err := model.ListKnowledgePages(bankId, pathPrefix)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    pages,
	})
}

// UpdateKnowledgePage godoc
// @Summary Update a knowledge page
// @Description Update a knowledge page's content
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param id path int true "page ID"
// @Param request body object true "page config"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/knowledge-pages/{id} [put]
func UpdateKnowledgePage(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid page ID"))
		return
	}
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Path    string `json:"path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	if err := model.UpdateKnowledgePage(id, req.Title, req.Content, req.Path); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Knowledge page updated",
	})
}

// DeleteKnowledgePage godoc
// @Summary Delete a knowledge page
// @Description Delete a knowledge page by ID
// @Tags agent-memory
// @Accept json
// @Produce json
// @Param id path int true "page ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/memory/knowledge-pages/{id} [delete]
func DeleteKnowledgePage(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid page ID"))
		return
	}
	if err := model.DeleteKnowledgePage(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Knowledge page deleted",
	})
}
