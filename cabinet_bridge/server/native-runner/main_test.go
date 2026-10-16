package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"homearcade/runner/pkg/emulator"
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

	// P2: Buttons = 0x0008 (Start) | 0x3000 (L2+R2), Left = (-30, 40), Right = (100, -100)
	im.Update(1, 0x3008, -30, 40, 100, -100)
	p2State := im.GetState(1)
	if p2State.Buttons != 0x3008 {
		t.Fatalf("Expected P2 buttons 0x3008, got 0x%04x", p2State.Buttons)
	}
	if p2State.AxisX != -30 || p2State.AxisY != 40 {
		t.Fatalf("Expected P2 left axes (-30, 40), got (%d, %d)", p2State.AxisX, p2State.AxisY)
	}
	if p2State.RightAxisX != 100 || p2State.RightAxisY != -100 {
		t.Fatalf("Expected P2 right axes (100, -100), got (%d, %d)", p2State.RightAxisX, p2State.RightAxisY)
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

func TestHandlePeers_Output(t *testing.T) {
	peerMu.Lock()
	peerMap["peer-test-1"] = &PeerEntry{
		ID:         "peer-test-1",
		PlayerSlot: 0,
	}
	peerMap["peer-test-2"] = &PeerEntry{
		ID:         "peer-test-2",
		PlayerSlot: 1,
	}
	peerMu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/peers", nil)
	w := httptest.NewRecorder()

	handlePeers(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to parse peers JSON: %v", err)
	}

	if count, ok := res["count"].(float64); !ok || int(count) < 2 {
		t.Fatalf("Expected at least 2 peers, got %v", res["count"])
	}

	// Cleanup
	peerMu.Lock()
	delete(peerMap, "peer-test-1")
	delete(peerMap, "peer-test-2")
	peerMu.Unlock()
}

func TestHandleSaveAndLoad(t *testing.T) {
	// 1. Without active session -> 404
	emuSessionMu.Lock()
	activeEmuSession = nil
	emuSessionMu.Unlock()

	reqNoSession := httptest.NewRequest(http.MethodPost, "/save", nil)
	wNoSession := httptest.NewRecorder()
	handleSave(wNoSession, reqNoSession)
	if wNoSession.Code != http.StatusNotFound {
		t.Fatalf("Expected status 404 with no session, got %d", wNoSession.Code)
	}

	// 2. With mock session
	mockSess := emulator.NewStandaloneSession(320, 240, 60, 44100)
	emuSessionMu.Lock()
	activeEmuSession = mockSess
	emuSessionMu.Unlock()
	defer func() {
		emuSessionMu.Lock()
		activeEmuSession = nil
		emuSessionMu.Unlock()
	}()

	// Save
	reqSave := httptest.NewRequest(http.MethodPost, "/save", nil)
	wSave := httptest.NewRecorder()
	handleSave(wSave, reqSave)
	if wSave.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for save, got %d", wSave.Code)
	}
	savedBytes := wSave.Body.Bytes()
	if len(savedBytes) == 0 {
		t.Fatalf("Expected non-empty save state")
	}

	// Load
	reqLoad := httptest.NewRequest(http.MethodPost, "/load", bytes.NewReader(savedBytes))
	wLoad := httptest.NewRecorder()
	handleLoad(wLoad, reqLoad)
	if wLoad.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for load, got %d", wLoad.Code)
	}

	var loadRes map[string]interface{}
	if err := json.Unmarshal(wLoad.Body.Bytes(), &loadRes); err != nil {
		t.Fatalf("Failed to parse load JSON: %v", err)
	}
	if loadRes["success"] != true {
		t.Fatalf("Expected success true, got %v", loadRes)
	}

	// Load empty payload -> 400
	reqEmptyLoad := httptest.NewRequest(http.MethodPost, "/load", bytes.NewReader(nil))
	wEmptyLoad := httptest.NewRecorder()
	handleLoad(wEmptyLoad, reqEmptyLoad)
	if wEmptyLoad.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for empty load payload, got %d", wEmptyLoad.Code)
	}
}


