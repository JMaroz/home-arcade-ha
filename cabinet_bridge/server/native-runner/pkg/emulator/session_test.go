package emulator

import (
	"testing"
)

func TestStandaloneSession_Lifecycle(t *testing.T) {
	s := NewStandaloneSession(320, 240, 60, 44100)

	if err := s.Load("/path/to/rom.chd", "/path/to/core.so"); err != nil {
		t.Fatalf("Failed to load session: %v", err)
	}

	geom := s.GetGeometry()
	if geom.Width != 320 || geom.Height != 240 || geom.FPS != 60 {
		t.Fatalf("Unexpected geometry: %+v", geom)
	}

	// Advance 5 steps
	for i := 0; i < 5; i++ {
		s.Step()
	}

	frame, fmt := s.GetFrame()
	if len(frame) != 320*240*4 {
		t.Fatalf("Expected frame size %d, got %d", 320*240*4, len(frame))
	}
	if fmt != geom.PixelFormat {
		t.Fatalf("Expected pixel format %v, got %v", geom.PixelFormat, fmt)
	}

	audio := s.GetAudio()
	if len(audio) == 0 {
		t.Fatalf("Audio buffer empty")
	}

	// Set inputs
	s.SetInput(0, RetroInputState{Buttons: 0x01, AxisX: 30, AxisY: -50})

	// Test state save and load
	saved, err := s.Serialize()
	if err != nil || len(saved) == 0 {
		t.Fatalf("Serialize failed: %v", err)
	}

	if err := s.Unserialize(saved); err != nil {
		t.Fatalf("Unserialize failed: %v", err)
	}

	if err := s.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
}
