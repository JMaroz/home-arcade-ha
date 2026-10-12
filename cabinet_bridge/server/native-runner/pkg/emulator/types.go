package emulator

import (
	"homearcade/runner/pkg/encoder"
)

// RetroPixelFormat matches standard Libretro definitions
type RetroPixelFormat int

const (
	Format0RGB1555 RetroPixelFormat = 0
	FormatXRGB8888 RetroPixelFormat = 1
	FormatRGB565   RetroPixelFormat = 2
)

// RetroGeometry defines emulator screen resolution and timing
type RetroGeometry struct {
	Width       int
	Height      int
	FPS         int
	SampleRate  int
	AspectRatio float32
	PixelFormat encoder.PixelFormat
}

// RetroInputState represents a player's inputs for the current frame
type RetroInputState struct {
	Buttons    uint16
	AxisX      int8
	AxisY      int8
	RightAxisX int8
	RightAxisY int8
}

// EmulatorSession abstracts the underlying Libretro core execution
type EmulatorSession interface {
	Load(romPath, corePath string) error
	Step()
	GetFrame() ([]byte, encoder.PixelFormat)
	GetAudio() []int16
	SetInput(player int, state RetroInputState)
	Serialize() ([]byte, error)
	Unserialize(data []byte) error
	Close() error
	GetGeometry() RetroGeometry
}
