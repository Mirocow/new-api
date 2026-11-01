package controller

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetChannelPenaltyStats(c *gin.Context) {
	stats := service.GetAllPenalizedChannels()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    stats,
	})
}

func ClearChannelPenalty(c *gin.Context) {
	channelIDStr := c.Param("id")
	if channelIDStr == "" {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Missing channel ID"))
		return
	}

	var channelID int
	if _, err := fmt.Sscanf(channelIDStr, "%d", &channelID); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid channel ID"))
		return
	}

	service.ClearChannelPenalty(channelID)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Penalty cleared",
		"data":    nil,
	})
}

func ClearAllChannelPenalties(c *gin.Context) {
	service.ClearAllChannelPenalties()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "All penalties cleared",
		"data":    nil,
	})
}