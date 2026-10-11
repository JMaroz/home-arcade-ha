//go:build cgo && (linux || darwin)

package emulator

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unsafe"

	"homearcade/runner/pkg/encoder"
)

/*
#cgo linux LDFLAGS: -ldl -lpthread
#include "libretro.h"
#include "nanoarch.h"
#include <stdlib.h>
*/
import "C"

// Global active session pointer for Cgo callbacks
var (
	activeSessionMu sync.RWMutex
	activeSession   *CgoLibretroSession
)

type CgoLibretroSession struct {
	mu           sync.RWMutex
	dlib         *dynamicLib
	romPath      string
	corePath     string
	isRunning    bool
	geometry     RetroGeometry
	frameBuffer  []byte
	audioBuffer  []int16
	fnRetroRun   unsafe.Pointer
	fnRetroDeinit unsafe.Pointer
	fnRetroUnload unsafe.Pointer
}

func NewCgoLibretroSession(width, height, fps, sampleRate int) EmulatorSession {
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

	return &CgoLibretroSession{
		geometry: RetroGeometry{
			Width:      width,
			Height:     height,
			FPS:        fps,
			SampleRate: sampleRate,
		},
		frameBuffer: make([]byte, width*height*4),
		audioBuffer: make([]int16, (sampleRate/fps)*2),
	}
}

func (s *CgoLibretroSession) Load(romPath, corePath string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dlib, err := openDynamicLib(corePath)
	if err != nil {
		return fmt.Errorf("failed to open Libretro core '%s': %w", corePath, err)
	}
	s.dlib = dlib
	s.romPath = romPath
	s.corePath = corePath

	// Set global active session for Cgo callbacks
	activeSessionMu.Lock()
	activeSession = s
	activeSessionMu.Unlock()

	// Load core functions
	fnInit, err := dlib.load("retro_init")
	if err != nil {
		return err
	}
	fnDeinit, _ := dlib.load("retro_deinit")
	s.fnRetroDeinit = fnDeinit

	fnRun, err := dlib.load("retro_run")
	if err != nil {
		return err
	}
	s.fnRetroRun = fnRun

	fnLoadGame, err := dlib.load("retro_load_game")
	if err != nil {
		return err
	}
	fnUnloadGame, _ := dlib.load("retro_unload_game")
	s.fnRetroUnload = fnUnloadGame

	fnSetEnv, _ := dlib.load("retro_set_environment")
	fnSetVideo, _ := dlib.load("retro_set_video_refresh")
	fnSetAudioSample, _ := dlib.load("retro_set_audio_sample")
	fnSetAudioBatch, _ := dlib.load("retro_set_audio_sample_batch")
	fnSetInputPoll, _ := dlib.load("retro_set_input_poll")
	fnSetInputState, _ := dlib.load("retro_set_input_state")

	// Set callbacks
	if fnSetEnv != nil {
		C.bridge_retro_set_environment(fnSetEnv, C.core_environment_cgo)
	}
	if fnSetVideo != nil {
		C.bridge_set_callback(fnSetVideo, C.core_video_refresh_cgo)
	}
	if fnSetAudioSample != nil {
		C.bridge_set_callback(fnSetAudioSample, C.core_audio_sample_cgo)
	}
	if fnSetAudioBatch != nil {
		C.bridge_set_callback(fnSetAudioBatch, C.core_audio_sample_batch_cgo)
	}
	if fnSetInputPoll != nil {
		C.bridge_set_callback(fnSetInputPoll, C.core_input_poll_cgo)
	}
	if fnSetInputState != nil {
		C.bridge_retro_set_input_state(fnSetInputState, C.core_input_state_cgo)
	}

	// retro_init
	C.bridge_call(fnInit)

	// Prepare ROM loading path
	cPath := C.CString(romPath)
	defer C.free(unsafe.Pointer(cPath))

	var ok C.bool
	ext := strings.ToLower(filepath.Ext(romPath))
	// Disk systems (.chd, .iso, .cue, .m3u, .pbp, .cso) or files > 16MB must load from path directly
	isDiskOrLarge := false
	if ext == ".chd" || ext == ".iso" || ext == ".cue" || ext == ".m3u" || ext == ".pbp" || ext == ".cso" {
		isDiskOrLarge = true
	} else if fi, err := os.Stat(romPath); err == nil && fi.Size() > 16*1024*1024 {
		isDiskOrLarge = true
	}

	if isDiskOrLarge {
		ok = C.bridge_load_game(fnLoadGame, cPath, nil, 0)
	} else {
		romBytes, err := os.ReadFile(romPath)
		if err == nil && len(romBytes) > 0 {
			cData := C.CBytes(romBytes)
			defer C.free(cData)
			ok = C.bridge_load_game(fnLoadGame, cPath, cData, C.size_t(len(romBytes)))
		} else {
			ok = C.bridge_load_game(fnLoadGame, cPath, nil, 0)
		}
	}

	if !bool(ok) {
		return fmt.Errorf("retro_load_game returned false for ROM '%s'", romPath)
	}

	// Query AV info
	if fnGetAv, err := dlib.load("retro_get_system_av_info"); err == nil {
		var av C.struct_retro_system_av_info
		C.bridge_retro_get_system_av_info(fnGetAv, &av)
		if av.geometry.base_width > 0 && av.geometry.base_height > 0 {
			s.geometry.Width = int(av.geometry.base_width)
			s.geometry.Height = int(av.geometry.base_height)
			s.frameBuffer = make([]byte, s.geometry.Width*s.geometry.Height*4)
		}
		if av.timing.fps > 0 {
			s.geometry.FPS = int(av.timing.fps)
		}
		if av.timing.sample_rate > 0 {
			s.geometry.SampleRate = int(av.timing.sample_rate)
		}
	}

	s.isRunning = true
	log.Printf("[runner:cgo] Libretro core loaded: %s (%dx%d @ %d FPS, Audio: %dHz)\n",
		corePath, s.geometry.Width, s.geometry.Height, s.geometry.FPS, s.geometry.SampleRate)

	return nil
}

func (s *CgoLibretroSession) Step() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning || s.fnRetroRun == nil {
		return
	}

	C.same_thread(s.fnRetroRun)
}

func (s *CgoLibretroSession) GetFrame() ([]byte, encoder.PixelFormat) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.frameBuffer, s.geometry.PixelFormat
}

func (s *CgoLibretroSession) GetAudio() []int16 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.audioBuffer
}

func (s *CgoLibretroSession) SetInput(player int, state RetroInputState) {
	if player < 0 || player >= 4 {
		return
	}
	C.input_cache_set_port(
		C.uint(player),
		C.uint32_t(state.Buttons),
		C.int16_t(int(state.AxisX)*256),
		C.int16_t(int(state.AxisY)*256),
		0, 0, 0, 0,
	)
}

func (s *CgoLibretroSession) Serialize() ([]byte, error) {
	return []byte(fmt.Sprintf("CGO-STATE-%d", time.Now().Unix())), nil
}

func (s *CgoLibretroSession) Unserialize(data []byte) error {
	return nil
}

func (s *CgoLibretroSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		s.isRunning = false
		if s.fnRetroUnload != nil {
			C.bridge_call(s.fnRetroUnload)
		}
		if s.fnRetroDeinit != nil {
			C.bridge_call(s.fnRetroDeinit)
		}
		C.same_thread_stop()
	}

	if s.dlib != nil {
		_ = s.dlib.close()
		s.dlib = nil
	}

	activeSessionMu.Lock()
	if activeSession == s {
		activeSession = nil
	}
	activeSessionMu.Unlock()

	return nil
}

func (s *CgoLibretroSession) GetGeometry() RetroGeometry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.geometry
}

// ── Exported Cgo Callbacks ──────────────────────────────────────────────────

//export coreVideoRefresh
func coreVideoRefresh(data unsafe.Pointer, width, height C.uint, pitch C.size_t) {
	if data == nil || width == 0 || height == 0 {
		return
	}
	activeSessionMu.RLock()
	s := activeSession
	activeSessionMu.RUnlock()
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	w := int(width)
	h := int(height)
	if w != s.geometry.Width || h != s.geometry.Height {
		s.geometry.Width = w
		s.geometry.Height = h
	}

	bytesPerPixel := 4
	if s.geometry.PixelFormat == encoder.PixelFormatRGB565 || s.geometry.PixelFormat == encoder.PixelFormat0RGB1555 {
		bytesPerPixel = 2
	}

	bytesCount := int(pitch) * h
	if bytesCount <= 0 {
		bytesCount = w * h * bytesPerPixel
	}

	srcSlice := unsafe.Slice((*byte)(data), bytesCount)
	if len(s.frameBuffer) < bytesCount {
		s.frameBuffer = make([]byte, bytesCount)
	}
	copy(s.frameBuffer, srcSlice)
}

//export coreAudioSampleBatch
func coreAudioSampleBatch(data *C.int16_t, frames C.size_t) C.size_t {
	if data == nil || frames == 0 {
		return frames
	}
	activeSessionMu.RLock()
	s := activeSession
	activeSessionMu.RUnlock()
	if s == nil {
		return frames
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	count := int(frames) * 2 // stereo
	srcSlice := unsafe.Slice((*int16)(unsafe.Pointer(data)), count)
	if len(s.audioBuffer) < count {
		s.audioBuffer = make([]int16, count)
	}
	copy(s.audioBuffer, srcSlice)
	return frames
}

//export coreLog
func coreLog(level C.enum_retro_log_level, msg *C.char) {
	// Filter debug logs
	if level > C.RETRO_LOG_INFO {
		return
	}
	log.Printf("[libretro:core] %s", C.GoString(msg))
}

//export coreEnvironment
func coreEnvironment(cmd C.unsigned, data unsafe.Pointer) C.bool {
	switch cmd {
	case C.RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:
		if data != nil {
			fmtPtr := (*C.enum_retro_pixel_format)(data)
			activeSessionMu.RLock()
			s := activeSession
			activeSessionMu.RUnlock()
			if s != nil {
				s.mu.Lock()
				switch *fmtPtr {
				case C.RETRO_PIXEL_FORMAT_0RGB1555:
					s.geometry.PixelFormat = encoder.PixelFormatRGB565
				case C.RETRO_PIXEL_FORMAT_XRGB8888:
					s.geometry.PixelFormat = encoder.PixelFormatXRGB8888
				case C.RETRO_PIXEL_FORMAT_RGB565:
					s.geometry.PixelFormat = encoder.PixelFormatRGB565
				}
				s.mu.Unlock()
			}
			return true
		}
	case C.RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
		if data != nil {
			*(**C.char)(data) = C.CString("/data/bios")
			return true
		}
	case C.RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
		if data != nil {
			*(**C.char)(data) = C.CString("/data/saves")
			return true
		}
	case C.RETRO_ENVIRONMENT_GET_CAN_DUPE:
		if data != nil {
			*(*C.bool)(data) = true
			return true
		}
	}
	return false
}

//export coreGetCurrentFramebuffer
func coreGetCurrentFramebuffer() C.uintptr_t { return 0 }

//export coreGetProcAddress
func coreGetProcAddress(sym *C.char) C.retro_proc_address_t { return nil }

//export initVideo
func initVideo() {}

//export deinitVideo
func deinitVideo() {}
