package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInputManager_BinaryUpdate(t *testing.T) {
	im := &InputManager{}

	// P1: Buttons = 0x0001 (B button) | 0x0100 (A button), AxisX = 64, AxisY = -64
	var testButtons uint16 = 0x0101
	im.Update(0, testButtons, 64, -64)

	state := im.GetState(0)
	if state.Buttons != testButtons {
		t.Fatalf("Expected buttons 0x%04x, got 0x%04x", testButtons, state.Buttons)
	}
	if state.AxisX != 64 {
		t.Fatalf("Expected AxisX 64, got %d", state.AxisX)
	}
	if state.AxisY != -64 {
		t.Fatalf("Expected AxisY -64, got %d", state.AxisY)
	}

	// P2: Buttons = 0x0008 (Start)
	im.Update(1, 0x0008, 0, 0)
	p2State := im.GetState(1)
	if p2State.Buttons != 0x0008 {
		t.Fatalf("Expected P2 buttons 0x0008, got 0x%04x", p2State.Buttons)
	}
}

func TestHandleHealth_Output(t *testing.T) {
	config.SessionID = "test-session"
	config.System = "ps1"
	config.FPS = 60
	config.HostIP = "192.168.1.100"

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to parse health JSON: %v", err)
	}

	if res["status"] != "ok" || res["session"] != "test-session" || res["system"] != "ps1" {
		t.Fatalf("Unexpected health response: %+v", res)
	}
	if res["host_ip"] != "192.168.1.100" {
		t.Fatalf("Expected host_ip 192.168.1.100, got %v", res["host_ip"])
	}
}
