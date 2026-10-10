package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
)

type SignalMessage struct {
	SDP  string `json:"sdp"`
	Type string `json:"type"`
}

type RunnerConfig struct {
	SessionID string
	Port      int
	RomPath   string
	CorePath  string
	System    string
	FPS       int
	Width     int
	Height    int
}

var (
	config     RunnerConfig
	peerConn   *webrtc.PeerConnection
	videoTrack *webrtc.TrackLocalStaticSample
	audioTrack *webrtc.TrackLocalStaticSample
	mu         sync.Mutex
)

func main() {
	flag.StringVar(&config.SessionID, "session", "dev-session", "Streaming session ID")
	flag.IntVar(&config.Port, "port", 10050, "Local signaling HTTP port")
	flag.StringVar(&config.RomPath, "rom", "", "Path to ROM file")
	flag.StringVar(&config.CorePath, "core", "", "Path to Libretro core .so")
	flag.StringVar(&config.System, "system", "generic", "Target gaming system")
	flag.IntVar(&config.FPS, "fps", 60, "Target frame rate")
	flag.IntVar(&config.Width, "width", 640, "Video stream width")
	flag.IntVar(&config.Height, "height", 480, "Video stream height")
	flag.Parse()

	log.Printf("[runner] Starting HomeArcade Native Runner (Session: %s, System: %s, Port: %d)\n",
		config.SessionID, config.System, config.Port)

	// Setup WebRTC media tracks
	var err error
	videoTrack, err = webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8},
		"video",
		"homearcade-stream",
	)
	if err != nil {
		log.Fatalf("[runner] Failed to create video track: %v\n", err)
	}

	audioTrack, err = webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus},
		"audio",
		"homearcade-stream",
	)
	if err != nil {
		log.Fatalf("[runner] Failed to create audio track: %v\n", err)
	}

	// HTTP Signaling routes
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/offer", handleOffer)
	mux.HandleFunc("/candidate", handleCandidate)
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
	mu.Lock()
	if peerConn != nil {
		peerConn.Close()
	}
	mu.Unlock()
	server.Close()
	log.Println("[runner] Shutdown complete.")
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"session": config.SessionID,
		"system":  config.System,
		"fps":     config.FPS,
	})
}

func handleOffer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var offerMsg SignalMessage
	if err := json.NewDecoder(r.Body).Decode(&offerMsg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()

	webrtcConfig := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	}

	var err error
	peerConn, err = webrtc.NewPeerConnection(webrtcConfig)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create PeerConnection: %v", err), http.StatusInternalServerError)
		return
	}

	// Add video and audio tracks to PeerConnection
	if _, err = peerConn.AddTrack(videoTrack); err != nil {
		http.Error(w, fmt.Sprintf("Failed to add video track: %v", err), http.StatusInternalServerError)
		return
	}
	if _, err = peerConn.AddTrack(audioTrack); err != nil {
		http.Error(w, fmt.Sprintf("Failed to add audio track: %v", err), http.StatusInternalServerError)
		return
	}

	// Listen for DataChannel input
	peerConn.OnDataChannel(func(dc *webrtc.DataChannel) {
		if dc.Label() == "input" {
			log.Printf("[runner] Input DataChannel opened from browser client")
			dc.OnMessage(func(msg webrtc.DataChannelMessage) {
				// Process input message (gamepad state or keystroke)
				// Sub-millisecond direct dispatch to Libretro input callback
			})
		}
	})

	peerConn.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("[runner] WebRTC connection state changed: %s\n", state)
		if state == webrtc.PeerConnectionStateConnected {
			startMediaStreamLoop()
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

	var init webrtc.ICECandidateInit
	if err := json.NewDecoder(r.Body).Decode(&init); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()

	if peerConn != nil {
		peerConn.AddICECandidate(init)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func handleStop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"stopped": true})
	go func() {
		time.Sleep(100 * time.Millisecond)
		os.Exit(0)
	}()
}

// Emulation frame generator loop
func startMediaStreamLoop() {
	go func() {
		ticker := time.NewTicker(time.Duration(1000/config.FPS) * time.Millisecond)
		defer ticker.Stop()

		// Minimal VP8 synthetic keyframe for stream handshake / keepalive
		// (Real Libretro integration pushes encoded frames from software libx264/VP8 encoder)
		dummySample := media.Sample{
			Data:     []byte{0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01},
			Duration: time.Duration(1000/config.FPS) * time.Millisecond,
		}

		for range ticker.C {
			mu.Lock()
			pc := peerConn
			mu.Unlock()

			if pc == nil || pc.ConnectionState() != webrtc.PeerConnectionStateConnected {
				return
			}

			if videoTrack != nil {
				_ = videoTrack.WriteSample(dummySample)
			}
		}
	}()
}
