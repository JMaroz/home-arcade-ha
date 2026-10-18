package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/pion/ice/v4"
	"github.com/pion/webrtc/v4"

	"homearcade/runner/pkg/audio"
	"homearcade/runner/pkg/emulator"
	"homearcade/runner/pkg/encoder"
)

type SignalMessage struct {
	SDP  string `json:"sdp"`
	Type string `json:"type"`
}

type RunnerConfig struct {
	SessionID  string
	Port       int
	HostIP     string
	UDPMinPort int
	UDPMaxPort int
	TCPPort    int
	RomPath    string
	CorePath   string
	System     string
	FPS        int
	Width      int
	Height     int
}

// PlayerInputState tracks real-time pad buttons and analog axes
type PlayerInputState struct {
	Buttons    uint16
	AxisX      int8
	AxisY      int8
	RightAxisX int8
	RightAxisY int8
	Updated    time.Time
}

type InputManager struct {
	mu      sync.RWMutex
	players [4]PlayerInputState
}

func (im *InputManager) Update(player int, buttons uint16, axisX, axisY int8, rightAxes ...int8) {
	if player < 0 || player >= 4 {
		return
	}
	var rx, ry int8
	if len(rightAxes) >= 2 {
		rx = rightAxes[0]
		ry = rightAxes[1]
	}
	im.mu.Lock()
	im.players[player] = PlayerInputState{
		Buttons:    buttons,
		AxisX:      axisX,
		AxisY:      axisY,
		RightAxisX: rx,
		RightAxisY: ry,
		Updated:    time.Now(),
	}
	im.mu.Unlock()
}

func (im *InputManager) GetState(player int) PlayerInputState {
	if player < 0 || player >= 4 {
		return PlayerInputState{}
	}
	im.mu.RLock()
	defer im.mu.RUnlock()
	return im.players[player]
}

type PeerEntry struct {
	ID         string                  `json:"id"`
	PlayerSlot int                     `json:"playerSlot"`
	PC         *webrtc.PeerConnection  `json:"-"`
	DC         *webrtc.DataChannel     `json:"-"`
	State      webrtc.PeerConnectionState `json:"state"`
}

var (
	config      RunnerConfig
	api         *webrtc.API
	peerMap     = make(map[string]*PeerEntry)
	peerMu      sync.RWMutex
	videoTrack  *webrtc.TrackLocalStaticSample
	audioTrack  *webrtc.TrackLocalStaticSample
	inputMgr    = &InputManager{}
	loopMu           sync.Mutex
	loopRunning      bool
	peerSeq          uint64
	emuSessionMu     sync.RWMutex
	activeEmuSession emulator.EmulatorSession
)

func main() {
	flag.StringVar(&config.SessionID, "session", "dev-session", "Streaming session ID")
	flag.IntVar(&config.Port, "port", 10050, "Local signaling HTTP port")
	flag.StringVar(&config.HostIP, "host-ip", "", "Host IP address for ICE NAT 1:1 mapping")
	flag.IntVar(&config.UDPMinPort, "udp-min", 0, "Minimum ephemeral UDP port")
	flag.IntVar(&config.UDPMaxPort, "udp-max", 0, "Maximum ephemeral UDP port")
	flag.IntVar(&config.TCPPort, "tcp-port", 0, "Optional TCP mux port for WebRTC over TCP")
	flag.StringVar(&config.RomPath, "rom", "", "Path to ROM file")
	flag.StringVar(&config.CorePath, "core", "", "Path to Libretro core .so")
	flag.StringVar(&config.System, "system", "generic", "Target gaming system")
	flag.IntVar(&config.FPS, "fps", 60, "Target frame rate")
	flag.IntVar(&config.Width, "width", 640, "Video stream width")
	flag.IntVar(&config.Height, "height", 480, "Video stream height")
	flag.Parse()

	log.Printf("[runner] Starting HomeArcade Native Runner (Session: %s, System: %s, Port: %d)\n",
		config.SessionID, config.System, config.Port)

	// Configure WebRTC SettingEngine for NAT traversal and port control
	settingEngine := webrtc.SettingEngine{}

	if config.HostIP != "" {
		var hostIPs []string
		for _, ip := range strings.Split(config.HostIP, ",") {
			trimmed := strings.TrimSpace(ip)
			if trimmed != "" {
				hostIPs = append(hostIPs, trimmed)
			}
		}
		if len(hostIPs) > 0 {
			settingEngine.SetNAT1To1IPs(hostIPs, webrtc.ICECandidateTypeHost)
			log.Printf("[runner] ICE NAT 1:1 candidate mapping enabled for host IPs: %v\n", hostIPs)
		}
	}

	if config.UDPMinPort > 0 && config.UDPMaxPort >= config.UDPMinPort {
		if err := settingEngine.SetEphemeralUDPPortRange(uint16(config.UDPMinPort), uint16(config.UDPMaxPort)); err != nil {
			log.Printf("[runner] Warning: failed to configure ephemeral UDP range: %v\n", err)
		} else {
			log.Printf("[runner] Ephemeral UDP range configured: %d-%d\n", config.UDPMinPort, config.UDPMaxPort)
		}
	}

	// Enable UDP4 and TCP4 network types
	settingEngine.SetNetworkTypes([]webrtc.NetworkType{
		webrtc.NetworkTypeUDP4,
		webrtc.NetworkTypeTCP4,
	})

	if config.TCPPort > 0 {
		tcpListener, err := net.ListenTCP("tcp4", &net.TCPAddr{IP: net.IP{0, 0, 0, 0}, Port: config.TCPPort})
		if err != nil {
			log.Printf("[runner] Warning: failed to listen on TCP port %d for WebRTC mux: %v\n", config.TCPPort, err)
		} else {
			tcpMux := ice.NewTCPMuxDefault(ice.TCPMuxParams{
				Listener: tcpListener,
			})
			settingEngine.SetICETCPMux(tcpMux)
			log.Printf("[runner] WebRTC TCP Muxer enabled on port %d\n", config.TCPPort)
		}
	}

	api = webrtc.NewAPI(webrtc.WithSettingEngine(settingEngine))

	// Setup WebRTC media tracks (shared across all peers - Fan-out)
	var err error
	videoTrack, err = webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8},
		"video",
		"homearcade-video",
	)
	if err != nil {
		log.Fatalf("[runner] Failed to create video track: %v\n", err)
	}

	audioTrack, err = webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus},
		"audio",
		"homearcade-audio",
	)
	if err != nil {
		log.Fatalf("[runner] Failed to create audio track: %v\n", err)
	}

	// HTTP Signaling routes
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/peers", handlePeers)
	mux.HandleFunc("/offer", handleOffer)
	mux.HandleFunc("/candidate", handleCandidate)
	mux.HandleFunc("/save", handleSave)
	mux.HandleFunc("/load", handleLoad)
	mux.HandleFunc("/stop", handleStop)

	server := &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", config.Port),
		Handler: mux,
	}

	go func() {
		log.Printf("[runner] Signaling listener ready on 127.0.0.1:%d\n", config.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[runner] Signaling server failed: %v\n", err)
		}
	}()

	// Graceful shutdown handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("[runner] Shutting down runner...")
	peerMu.Lock()
	for _, p := range peerMap {
		if p.PC != nil {
			p.PC.Close()
		}
	}
	peerMu.Unlock()
	server.Close()
	log.Println("[runner] Shutdown complete.")
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	p1State := inputMgr.GetState(0)
	peerMu.RLock()
	peerCount := len(peerMap)
	peerMu.RUnlock()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "ok",
		"session":    config.SessionID,
		"system":     config.System,
		"fps":        config.FPS,
		"host_ip":    config.HostIP,
		"udp_range":  fmt.Sprintf("%d-%d", config.UDPMinPort, config.UDPMaxPort),
		"tcp_port":   config.TCPPort,
		"p1_buttons": p1State.Buttons,
		"peer_count": peerCount,
	})
}

func handlePeers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	peerMu.RLock()
	defer peerMu.RUnlock()

	type PeerInfo struct {
		ID         string `json:"id"`
		PlayerSlot int    `json:"playerSlot"`
		State      string `json:"state"`
	}
	peers := make([]PeerInfo, 0, len(peerMap))
	for _, p := range peerMap {
		stateStr := "unknown"
		if p.PC != nil {
			stateStr = p.PC.ConnectionState().String()
		}
		peers = append(peers, PeerInfo{
			ID:         p.ID,
			PlayerSlot: p.PlayerSlot,
			State:      stateStr,
		})
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count": len(peers),
		"peers": peers,
	})
}

func handleOffer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	peerID := r.URL.Query().Get("peerId")
	if peerID == "" {
		peerMu.Lock()
		peerSeq++
		peerID = fmt.Sprintf("peer-%d-%d", time.Now().Unix(), peerSeq)
		peerMu.Unlock()
	}

	playerSlot := 0
	if pStr := r.URL.Query().Get("player"); pStr != "" {
		if val, err := strconv.Atoi(pStr); err == nil && val >= 0 && val < 4 {
			playerSlot = val
		}
	} else {
		// Auto-assign: if there is already an active peer, assign next slot
		peerMu.RLock()
		if len(peerMap) > 0 {
			playerSlot = len(peerMap)
			if playerSlot > 3 {
				playerSlot = 3
			}
		}
		peerMu.RUnlock()
	}

	var offerMsg SignalMessage
	if err := json.NewDecoder(r.Body).Decode(&offerMsg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	webrtcConfig := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	}

	var peerConn *webrtc.PeerConnection
	var err error
	if api != nil {
		peerConn, err = api.NewPeerConnection(webrtcConfig)
	} else {
		peerConn, err = webrtc.NewPeerConnection(webrtcConfig)
	}
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create PeerConnection: %v", err), http.StatusInternalServerError)
		return
	}

	// Add video and audio tracks to PeerConnection (Fan-out)
	if _, err = peerConn.AddTrack(videoTrack); err != nil {
		peerConn.Close()
		http.Error(w, fmt.Sprintf("Failed to add video track: %v", err), http.StatusInternalServerError)
		return
	}
	if _, err = peerConn.AddTrack(audioTrack); err != nil {
		peerConn.Close()
		http.Error(w, fmt.Sprintf("Failed to add audio track: %v", err), http.StatusInternalServerError)
		return
	}

	entry := &PeerEntry{
		ID:         peerID,
		PlayerSlot: playerSlot,
		PC:         peerConn,
		State:      peerConn.ConnectionState(),
	}

	peerMu.Lock()
	if existing, exists := peerMap[peerID]; exists && existing.PC != nil {
		existing.PC.Close()
	}
	peerMap[peerID] = entry
	peerMu.Unlock()

	// Listen for DataChannel input (Fan-in)
	peerConn.OnDataChannel(func(dc *webrtc.DataChannel) {
		if dc.Label() == "input" {
			log.Printf("[runner] Input DataChannel opened for peer %s (Slot P%d)\n", peerID, playerSlot+1)
			entry.DC = dc

			dc.OnMessage(func(msg webrtc.DataChannelMessage) {
				// 1. Ultra-fast binary packet (5 or 7 bytes: player, btn_lo, btn_hi, lx, ly[, rx, ry])
				if !msg.IsString && len(msg.Data) >= 5 {
					pIdx := int(msg.Data[0])
					if playerSlot > 0 && pIdx == 0 {
						pIdx = playerSlot
					}
					buttons := uint16(msg.Data[1]) | (uint16(msg.Data[2]) << 8)
					axisX := int8(msg.Data[3])
					axisY := int8(msg.Data[4])
					var rx, ry int8
					if len(msg.Data) >= 7 {
						rx = int8(msg.Data[5])
						ry = int8(msg.Data[6])
					}
					inputMgr.Update(pIdx, buttons, axisX, axisY, rx, ry)
					return
				}

				// 2. Backward compatibility fallback for legacy JSON payloads
				if msg.IsString {
					var legacy map[string]interface{}
					if err := json.Unmarshal(msg.Data, &legacy); err == nil {
						if t, ok := legacy["type"].(string); ok && t == "pad" {
							if bList, ok := legacy["b"].([]interface{}); ok {
								var mask uint16
								for i, v := range bList {
									if i < 16 {
										if val, ok := v.(float64); ok && val > 0.5 {
											mask |= (1 << i)
										}
									}
								}
								var ax, ay, rx, ry int8
								if aList, ok := legacy["a"].([]interface{}); ok && len(aList) >= 2 {
									if f, ok := aList[0].(float64); ok {
										ax = int8(f * 127)
									}
									if f, ok := aList[1].(float64); ok {
										ay = int8(f * 127)
									}
									if len(aList) >= 4 {
										if f, ok := aList[2].(float64); ok {
											rx = int8(f * 127)
										}
										if f, ok := aList[3].(float64); ok {
											ry = int8(f * 127)
										}
									}
								}
								inputMgr.Update(playerSlot, mask, ax, ay, rx, ry)
							}
						}
					}
				}
			})
		}
	})

	peerConn.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("[runner] Peer %s connection state changed: %s\n", peerID, state)
		peerMu.Lock()
		entry.State = state
		if state == webrtc.PeerConnectionStateFailed || state == webrtc.PeerConnectionStateClosed || state == webrtc.PeerConnectionStateDisconnected {
			delete(peerMap, peerID)
		}
		peerMu.Unlock()

		if state == webrtc.PeerConnectionStateConnected {
			ensureMediaStreamLoop()
		}
	})

	// Set remote offer description
	offer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerMsg.SDP,
	}
	if err = peerConn.SetRemoteDescription(offer); err != nil {
		http.Error(w, fmt.Sprintf("Failed to set remote description: %v", err), http.StatusInternalServerError)
		return
	}

	// Create SDP answer
	answer, err := peerConn.CreateAnswer(nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create answer: %v", err), http.StatusInternalServerError)
		return
	}

	gatherComplete := webrtc.GatheringCompletePromise(peerConn)
	if err = peerConn.SetLocalDescription(answer); err != nil {
		http.Error(w, fmt.Sprintf("Failed to set local description: %v", err), http.StatusInternalServerError)
		return
	}

	// Wait for ICE gathering
	<-gatherComplete

	localDesc := peerConn.LocalDescription()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SignalMessage{
		SDP:  localDesc.SDP,
		Type: "answer",
	})
}

func handleCandidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	peerID := r.URL.Query().Get("peerId")
	var init webrtc.ICECandidateInit
	if err := json.NewDecoder(r.Body).Decode(&init); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	peerMu.RLock()
	var targetPC *webrtc.PeerConnection
	if peerID != "" {
		if p, ok := peerMap[peerID]; ok && p.PC != nil {
			targetPC = p.PC
		}
	} else {
		for _, p := range peerMap {
			if p.PC != nil {
				targetPC = p.PC
				break
			}
		}
	}
	peerMu.RUnlock()

	if targetPC != nil {
		targetPC.AddICECandidate(init)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func handleSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	emuSessionMu.RLock()
	sess := activeEmuSession
	emuSessionMu.RUnlock()

	if sess == nil {
		http.Error(w, "No active emulation session", http.StatusNotFound)
		return
	}

	stateBytes, err := sess.Serialize()
	if err != nil {
		log.Printf("[runner] Serialize error: %v\n", err)
		http.Error(w, fmt.Sprintf("Serialize failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.Itoa(len(stateBytes)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(stateBytes)
}

func handleLoad(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	data, err := io.ReadAll(r.Body)
	if err != nil || len(data) == 0 {
		http.Error(w, "Missing state payload", http.StatusBadRequest)
		return
	}

	emuSessionMu.RLock()
	sess := activeEmuSession
	emuSessionMu.RUnlock()

	if sess == nil {
		http.Error(w, "No active emulation session", http.StatusNotFound)
		return
	}

	if err := sess.Unserialize(data); err != nil {
		log.Printf("[runner] Unserialize error: %v\n", err)
		http.Error(w, fmt.Sprintf("Unserialize failed: %v", err), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "size": len(data)})
}

func handleStop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"stopped": true})
	go func() {
		time.Sleep(100 * time.Millisecond)
		os.Exit(0)
	}()
}

func hasConnectedPeers() bool {
	peerMu.RLock()
	defer peerMu.RUnlock()
	for _, p := range peerMap {
		if p.PC != nil && (p.PC.ConnectionState() == webrtc.PeerConnectionStateConnected || p.PC.ConnectionState() == webrtc.PeerConnectionStateConnecting) {
			return true
		}
	}
	return false
}

func ensureMediaStreamLoop() {
	loopMu.Lock()
	defer loopMu.Unlock()
	if loopRunning {
		return
	}
	loopRunning = true
	go runMediaStreamLoop()
}

// Emulation and media streaming loop with fan-out to all connected peers
func runMediaStreamLoop() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[runner:fatal] Media stream loop panicked: %v\n", r)
		}
		loopMu.Lock()
		loopRunning = false
		loopMu.Unlock()
	}()

	fps := config.FPS
	if fps <= 0 {
		fps = 60
	}
	ticker := time.NewTicker(time.Second / time.Duration(fps))
	defer ticker.Stop()

	emuSession := emulator.CreateActiveSession(config.Width, config.Height, fps, 44100, config.RomPath, config.CorePath)
	emuSessionMu.Lock()
	activeEmuSession = emuSession
	emuSessionMu.Unlock()
	defer func() {
		emuSessionMu.Lock()
		activeEmuSession = nil
		emuSessionMu.Unlock()
		emuSession.Close()
	}()

	videoEncoder := encoder.NewActiveVideoEncoder(config.Width, config.Height, fps)
	defer videoEncoder.Close()

	geom := emuSession.GetGeometry()
	coreSampleRate := geom.SampleRate
	if coreSampleRate <= 0 {
		coreSampleRate = 44100
	}
	audioAccumulator := audio.NewAudioBufferAccumulator(coreSampleRate)
	defer audioAccumulator.Close()

	log.Printf("[runner] Emulation & WebRTC media stream pipeline active (%dx%d @ %d FPS, Audio In: %d Hz -> Opus 48000 Hz)\n",
		config.Width, config.Height, fps, coreSampleRate)

	idleTicks := 0
	maxIdleTicks := fps * 30
	frameCounter := 0
	videoSentBytes := 0
	audioSentBytes := 0

	for range ticker.C {
		if !hasConnectedPeers() {
			idleTicks++
			if idleTicks > maxIdleTicks {
				log.Println("[runner] No peers connected for 30s, pausing media loop")
				return
			}
			continue
		}
		idleTicks = 0
		frameCounter++

		// 1. Sync input states from DataChannel to emulator session (P1 to P4)
		for p := 0; p < 4; p++ {
			st := inputMgr.GetState(p)
			emuSession.SetInput(p, emulator.RetroInputState{
				Buttons:    st.Buttons,
				AxisX:      st.AxisX,
				AxisY:      st.AxisY,
				RightAxisX: st.RightAxisX,
				RightAxisY: st.RightAxisY,
			})
		}

		// 2. Step emulator frame
		emuSession.Step()

		// 3. Encode & write video sample (fan-out via WebRTC track to all peers)
		if videoTrack != nil {
			rawRGB, pixFmt := emuSession.GetFrame()
			geom := emuSession.GetGeometry()
			sample, err := videoEncoder.Encode(rawRGB, pixFmt, geom.Width, geom.Height)
			if err != nil {
				if frameCounter%180 == 0 {
					log.Printf("[runner:video] Encode error at frame %d: %v\n", frameCounter, err)
				}
			} else {
				videoSentBytes += len(sample.Data)
				if wsErr := videoTrack.WriteSample(sample); wsErr != nil {
					if frameCounter%180 == 0 {
						log.Printf("[runner:video] WriteSample error at frame %d: %v\n", frameCounter, wsErr)
					}
				}
			}
		}

		// 4. Resample & write audio samples (Opus 48kHz, 20ms frames)
		if audioTrack != nil {
			pcmAudio := emuSession.GetAudio()
			audioSamples := audioAccumulator.Push(pcmAudio)
			for _, aSample := range audioSamples {
				audioSentBytes += len(aSample.Data)
				_ = audioTrack.WriteSample(aSample)
			}
		}

		if frameCounter%300 == 0 { // every 5 seconds
			geom := emuSession.GetGeometry()
			log.Printf("[runner:stream] Stats @ %d frames: %dx%d, video: %d KB, audio: %d KB\n",
				frameCounter, geom.Width, geom.Height, videoSentBytes/1024, audioSentBytes/1024)
		}
	}
}
