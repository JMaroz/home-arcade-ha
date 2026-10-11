//go:build !cgo || (!linux && !darwin)

package emulator

// NewCgoLibretroSession stub for non-Linux / non-Cgo environments
func NewCgoLibretroSession(width, height, fps, sampleRate int) EmulatorSession {
	return NewStandaloneSession(width, height, fps, sampleRate)
}
