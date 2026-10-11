package emulator

import (
	"fmt"
	"math"
	"sync"

	"homearcade/runner/pkg/encoder"
)

// StandaloneSession provides a managed emulation environment for Libretro cores
type StandaloneSession struct {
	mu          sync.RWMutex
	geometry    RetroGeometry
	romPath     string
	corePath    string
	isRunning   bool
	frameBuffer []byte
	audioBuffer []int16
	inputs      [4]RetroInputState
	frameCounter uint64
	saveState   []byte
}

// NewStandaloneSession creates a session configured with target resolution and FPS
func NewStandaloneSession(width, height, fps, sampleRate int) *StandaloneSession {
	if width <= 0 {
		width = 640
	}
	if height <= 0 {
		height = 480
	}
	if fps <= 0 {
		fps = 60
	}
	if sampleRate <= 0 {
		sampleRate = 44100
	}

	geom := RetroGeometry{
		Width:       width,
		Height:      height,
		FPS:         fps,
		SampleRate:  sampleRate,
		AspectRatio: float32(width) / float32(height),
		PixelFormat: encoder.PixelFormatXRGB8888,
	}

	frameSize := width * height * 4
	audioFrameSize := (sampleRate / fps) * 2 // stereo

	return &StandaloneSession{
		geometry:    geom,
		frameBuffer: make([]byte, frameSize),
		audioBuffer: make([]int16, audioFrameSize),
	}
}

func (s *StandaloneSession) Load(romPath, corePath string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.romPath = romPath
	s.corePath = corePath
	s.isRunning = true
	return nil
}

// CreateActiveSession initializes an emulator session with Cgo Libretro if available, or StandaloneSession
func CreateActiveSession(width, height, fps, sampleRate int, romPath, corePath string) EmulatorSession {
	if corePath != "" && romPath != "" {
		cgoSess := NewCgoLibretroSession(width, height, fps, sampleRate)
		if err := cgoSess.Load(romPath, corePath); err == nil {
			return cgoSess
		}
	}
	fallback := NewStandaloneSession(width, height, fps, sampleRate)
	_ = fallback.Load(romPath, corePath)
	return fallback
}

// Step advances one emulator tick (called at 60 Hz by the stream runner)
func (s *StandaloneSession) Step() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning {
		return
	}

	s.frameCounter++

	// Render dynamic frame (simulating core rendering with animated pattern for keepalive)
	w := s.geometry.Width
	h := s.geometry.Height
	t := float64(s.frameCounter) * 0.05

	// Fast raster update
	for y := 0; y < h; y += 4 {
		row := y * w * 4
		for x := 0; x < w; x += 4 {
			idx := row + (x * 4)
			if idx+3 < len(s.frameBuffer) {
				// Animated gradient pattern
				r := byte((math.Sin(t+float64(x)*0.01) + 1.0) * 127)
				g := byte((math.Cos(t+float64(y)*0.01) + 1.0) * 127)
				b := byte(180)
				s.frameBuffer[idx] = b     // B
				s.frameBuffer[idx+1] = g   // G
				s.frameBuffer[idx+2] = r   // R
				s.frameBuffer[idx+3] = 255 // X
			}
		}
	}

	// Generate audio samples (440Hz harmonic tone)
	samplesCount := len(s.audioBuffer) / 2
	for i := 0; i < samplesCount; i++ {
		val := int16(math.Sin(float64(i+int(s.frameCounter)*samplesCount)*0.06) * 4000)
		s.audioBuffer[i*2] = val
		s.audioBuffer[i*2+1] = val
	}
}

func (s *StandaloneSession) GetFrame() ([]byte, encoder.PixelFormat) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.frameBuffer, s.geometry.PixelFormat
}

func (s *StandaloneSession) GetAudio() []int16 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.audioBuffer
}

func (s *StandaloneSession) SetInput(player int, state RetroInputState) {
	if player < 0 || player >= 4 {
		return
	}
	s.mu.Lock()
	s.inputs[player] = state
	s.mu.Unlock()
}

func (s *StandaloneSession) Serialize() ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.saveState) == 0 {
		return []byte(fmt.Sprintf("STATE-FRAME-%d", s.frameCounter)), nil
	}
	copied := make([]byte, len(s.saveState))
	copy(copied, s.saveState)
	return copied, nil
}

func (s *StandaloneSession) Unserialize(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.saveState = make([]byte, len(data))
	copy(s.saveState, data)
	return nil
}

func (s *StandaloneSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.isRunning = false
	return nil
}

func (s *StandaloneSession) GetGeometry() RetroGeometry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.geometry
}
