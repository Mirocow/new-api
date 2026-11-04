package wsmanager

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/go-redis/redis/v8"
	"github.com/gorilla/websocket"
	"github.com/gin-gonic/gin"
)

const (
	DashboardWSKind = "dashboard"
)

type DashboardWSEntry struct {
	ID        uint64
	UserID    int
	Role      int
	Close     func(reason string)
	Send      func(message []byte) error
}

type dashboardCloseEvent struct {
	UserIDs []int  `json:"user_ids"`
	Reason  string `json:"reason"`
	Origin  string `json:"origin"`
}

var (
	dashboardMu       sync.Mutex
	dashboardNextID   uint64
	dashboardRegistry = map[int]map[uint64]*DashboardWSEntry{}

	dashboardOriginOnce sync.Once
	dashboardOriginID   string

	dashboardSubscriberOnce sync.Once
)

func RegisterDashboardWS(userID int, role int, close func(reason string), send func(message []byte) error) func() {
	if userID <= 0 || close == nil || send == nil {
		return func() {}
	}
	var closeOnce sync.Once
	safeClose := func(reason string) {
		closeOnce.Do(func() {
			close(reason)
		})
	}
	id := atomic.AddUint64(&dashboardNextID, 1)
	e := &DashboardWSEntry{
		ID:    id,
		UserID: userID,
		Role:   role,
		Close:  safeClose,
		Send:   send,
	}

	dashboardMu.Lock()
	if dashboardRegistry[userID] == nil {
		dashboardRegistry[userID] = map[uint64]*DashboardWSEntry{}
	}
	dashboardRegistry[userID][id] = e
	dashboardMu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			dashboardMu.Lock()
			defer dashboardMu.Unlock()
			entries := dashboardRegistry[userID]
			if entries == nil {
				return
			}
			delete(entries, id)
			if len(entries) == 0 {
				delete(dashboardRegistry, userID)
			}
		})
	}
}

func CloseDashboardWS(userID int, reason string) int {
	return CloseDashboardWSList([]int{userID}, reason)
}

func CloseDashboardWSList(userIDs []int, reason string) int {
	reason = normalizeReason(reason)
	entries := takeDashboardEntries(userIDs)
	for _, e := range entries {
		e.Close(reason)
	}
	if len(entries) > 0 {
		common.SysLog(common.LogText("closed %d dashboard websocket connection(s), user_ids=%v, reason=%s", len(entries), entryUserIDs(entries), reason))
	}
	return len(entries)
}

func BroadcastDashboardEvent(eventType string, payload any) {
	data, err := common.Marshal(map[string]any{
		"type":    eventType,
		"payload": payload,
		"ts":      common.GetTimestamp(),
	})
	if err != nil {
		common.SysLog(common.LogText("failed to marshal dashboard event: %v", err))
		return
	}

	dashboardMu.Lock()
	defer dashboardMu.Unlock()

	for _, entries := range dashboardRegistry {
		for _, e := range entries {
			if err := e.Send(data); err != nil {
				common.SysLog(common.LogText("failed to send dashboard event to user %d: %v", e.UserID, err))
			}
		}
	}
}

func BroadcastDashboardEventToRole(eventType string, payload any, minRole int) {
	data, err := common.Marshal(map[string]any{
		"type":    eventType,
		"payload": payload,
		"ts":      common.GetTimestamp(),
	})
	if err != nil {
		common.SysLog(common.LogText("failed to marshal dashboard event: %v", err))
		return
	}

	dashboardMu.Lock()
	defer dashboardMu.Unlock()

	for _, entries := range dashboardRegistry {
		for _, e := range entries {
			if e.Role >= minRole {
				if err := e.Send(data); err != nil {
					common.SysLog(common.LogText("failed to send dashboard event to user %d: %v", e.UserID, err))
				}
			}
		}
	}
}

func StartDashboardSubscriber(ctx context.Context) {
	rdb := common.RDB
	if !common.RedisEnabled || rdb == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	dashboardSubscriberOnce.Do(func() {
		go func() {
			pubsub := rdb.Subscribe(ctx, dashboardChannelCloseTopic(rdb.Options().DB))
			defer pubsub.Close()
			receiveDashboardCloseEvents(ctx, pubsub.Channel(), getDashboardOriginID())
		}()
	})
}

func PublishDashboardCloseEvent(ctx context.Context, userIDs []int, reason string) error {
	rdb := common.RDB
	if !common.RedisEnabled || rdb == nil {
		return nil
	}
	ids := uniqueUserIDs(userIDs)
	if len(ids) == 0 {
		return nil
	}
	payload, err := common.Marshal(dashboardCloseEvent{
		UserIDs: ids,
		Reason:  normalizeReason(reason),
		Origin:  getDashboardOriginID(),
	})
	if err != nil {
		return err
	}
	return rdb.Publish(ctx, dashboardChannelCloseTopic(rdb.Options().DB), payload).Err()
}

func dashboardChannelCloseTopic(database int) string {
	return fmt.Sprintf("new-api:wsmanager:dashboard-close:db:%d", database)
}

func receiveDashboardCloseEvents(ctx context.Context, ch <-chan *redis.Message, origin string) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var event dashboardCloseEvent
			if err := common.Unmarshal([]byte(msg.Payload), &event); err != nil {
				common.SysLog(common.LogText("failed to unmarshal dashboard close event: %v", err))
				continue
			}
			if event.Origin == origin {
				continue
			}
			CloseDashboardWSList(event.UserIDs, event.Reason)
		}
	}
}

func takeDashboardEntries(userIDs []int) []*DashboardWSEntry {
	ids := uniqueUserIDs(userIDs)
	if len(ids) == 0 {
		return nil
	}

	dashboardMu.Lock()
	defer dashboardMu.Unlock()

	var entries []*DashboardWSEntry
	for _, userID := range ids {
		for _, e := range dashboardRegistry[userID] {
			entries = append(entries, e)
		}
		delete(dashboardRegistry, userID)
	}
	return entries
}

func entryUserIDs(entries []*DashboardWSEntry) []int {
	ids := make([]int, 0, len(entries))
	for _, e := range entries {
		if e != nil {
			ids = append(ids, e.UserID)
		}
	}
	return uniqueUserIDs(ids)
}

func uniqueUserIDs(userIDs []int) []int {
	seen := make(map[int]struct{}, len(userIDs))
	ids := make([]int, 0, len(userIDs))
	for _, id := range userIDs {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}

func getDashboardOriginID() string {
	dashboardOriginOnce.Do(func() {
		name := common.NodeName
		if name == "" {
			name = "node"
		}
		dashboardOriginID = fmt.Sprintf("%s-dashboard-%d-%d", name, time.Now().UnixNano(), 0)
	})
	return dashboardOriginID
}

type DashboardWSHandler struct {
	Upgrader websocket.Upgrader
}

func NewDashboardWSHandler() *DashboardWSHandler {
	return &DashboardWSHandler{
		Upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

func (h *DashboardWSHandler) HandleWS(c *gin.Context) {
	userID := c.GetInt("id")
	role := c.GetInt("role")
	if userID <= 0 {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}

	ws, err := h.Upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		common.SysLog(common.LogText("dashboard websocket upgrade failed: %v", err))
		return
	}
	defer ws.Close()

	send := func(message []byte) error {
		ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return ws.WriteMessage(websocket.TextMessage, message)
	}

	cleanup := RegisterDashboardWS(userID, role, func(reason string) {
		ws.SetWriteDeadline(time.Now().Add(2 * time.Second))
		ws.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, reason))
		ws.Close()
	}, send)

	defer cleanup()

	ws.SetReadLimit(512)
	ws.SetReadDeadline(time.Now().Add(60 * time.Second))
	ws.SetPongHandler(func(string) error {
		ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := ws.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			case <-c.Request.Context().Done():
				return
			}
		}
	}()

	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				common.SysLog(common.LogText("dashboard websocket read error: %v", err))
			}
			break
		}
	}
}