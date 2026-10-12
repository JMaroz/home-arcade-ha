//go:build cgo && (linux || darwin)

package emulator

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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
	stateMu       sync.Mutex
	frameMu       sync.RWMutex
	audioMu       sync.RWMutex
	dlib          *dynamicLib
	romPath       string
	corePath      string
	isRunning     bool
	geometry      RetroGeometry
	frameBuffer   []byte
	audioBuffer   []int16
	cleanup       func()
	fnRetroRun    unsafe.Pointer
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

// extractZippedRom extracts a .zip archive into a temporary directory and identifies the primary ROM file.
func extractZippedRom(zipPath string, validExtensions string) (string, string, error) {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", "", fmt.Errorf("failed to open zip archive '%s': %w", zipPath, err)
	}
	defer zr.Close()

	if len(zr.File) == 0 {
		return "", "", fmt.Errorf("zip archive '%s' is empty", zipPath)
	}

	tempDir, err := os.MkdirTemp("", "arcade-rom-*")
	if err != nil {
		return "", "", fmt.Errorf("failed to create temp extraction directory: %w", err)
	}

	var validExtList []string
	if validExtensions != "" {
		for _, ext := range strings.Split(validExtensions, "|") {
			ext = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
			if ext != "" {
				validExtList = append(validExtList, ext)
			}
		}
	}

	var chosenEntry *zip.File
	var maxScore int

	for _, f := range zr.File {
		cleanName := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanName, "..") || filepath.IsAbs(cleanName) {
			continue
		}
		base := filepath.Base(cleanName)
		if strings.HasPrefix(base, ".") || strings.HasPrefix(cleanName, "__MACOSX") {
			continue
		}

		targetPath := filepath.Join(tempDir, cleanName)
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(targetPath, 0755)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			_ = os.RemoveAll(tempDir)
			return "", "", fmt.Errorf("failed to create directory for '%s': %w", cleanName, err)
		}

		rc, err := f.Open()
		if err != nil {
			_ = os.RemoveAll(tempDir)
			return "", "", fmt.Errorf("failed to open zip entry '%s': %w", f.Name, err)
		}

		outFile, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			_ = os.RemoveAll(tempDir)
			return "", "", fmt.Errorf("failed to create extracted file '%s': %w", targetPath, err)
		}

		_, copyErr := io.Copy(outFile, rc)
		rc.Close()
		outFile.Close()
		if copyErr != nil {
			_ = os.RemoveAll(tempDir)
			return "", "", fmt.Errorf("failed to write extracted file '%s': %w", targetPath, copyErr)
		}

		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(cleanName), "."))
		if ext == "txt" || ext == "nfo" || ext == "diz" || ext == "xml" || ext == "html" || ext == "jpg" || ext == "png" {
			continue
		}

		score := 10
		if ext == "m3u" {
			score += 1000
		} else if ext == "cue" {
			score += 500
		}

		for _, ve := range validExtList {
			if ext == ve {
				score += 100
				break
			}
		}

		if chosenEntry == nil || score > maxScore || (score == maxScore && f.UncompressedSize64 > chosenEntry.UncompressedSize64) {
			chosenEntry = f
			maxScore = score
		}
	}

	if chosenEntry == nil {
		_ = os.RemoveAll(tempDir)
		return "", "", fmt.Errorf("no valid ROM file candidate found in '%s'", zipPath)
	}

	romPath := filepath.Join(tempDir, filepath.Clean(chosenEntry.Name))
	return romPath, tempDir, nil
}

var (
	reRegionTag = regexp.MustCompile(`\s*\([A-Z][a-zA-Z,\s]*\)`)
	reBrackets  = regexp.MustCompile(`\s*\[[^\]]*\]`)
	reRevTag    = regexp.MustCompile(`(?i)\s*\((Rev|v|Beta|Proto|Demo|Sample|Hack|Alt|Unl)[^)]*\)`)
	reDiscTag   = regexp.MustCompile(`(?i)\s*\(Dis[ck][^)]*\)`)
	reNonAlnum  = regexp.MustCompile(`[^a-z0-9]+`)
)

func slugifyRomFileName(fileName string) string {
	base := filepath.Base(fileName)
	ext := filepath.Ext(base)
	name := strings.TrimSuffix(base, ext)
	name = reRegionTag.ReplaceAllString(name, "")
	name = reBrackets.ReplaceAllString(name, "")
	name = reRevTag.ReplaceAllString(name, "")
	name = reDiscTag.ReplaceAllString(name, "")
	name = strings.ToLower(strings.TrimSpace(name))
	slug := strings.Trim(reNonAlnum.ReplaceAllString(name, "_"), "_")
	if slug == "" {
		return "rom"
	}
	return slug
}

func extractUploadedSlug(fileName string) string {
	base := filepath.Base(fileName)
	ext := filepath.Ext(base)
	noExt := strings.ToLower(strings.TrimSuffix(base, ext))
	firstIdx := strings.IndexByte(noExt, '_')
	lastIdx := strings.LastIndexByte(noExt, '_')
	if firstIdx <= 0 || lastIdx <= firstIdx {
		return ""
	}
	return noExt[firstIdx+1 : lastIdx]
}

// resolveM3uFile inspects an .m3u playlist: strips carriage returns (\r), resolves
// single-disc M3U playlists directly to the underlying disc image (including slug-renamed
// uploads like ps1_<slug>_<id>.chd), and sanitizes multi-disc playlists.
func resolveM3uFile(m3uPath string) (string, func(), error) {
	rawBytes, err := os.ReadFile(m3uPath)
	if err != nil {
		return m3uPath, nil, fmt.Errorf("failed to read m3u file '%s': %w", m3uPath, err)
	}

	lines := strings.Split(string(rawBytes), "\n")
	var cleanEntries []string
	hasCR := false
	for _, l := range lines {
		if strings.Contains(l, "\r") {
			hasCR = true
		}
		trimmed := strings.TrimSpace(strings.TrimRight(l, "\r\n"))
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			cleanEntries = append(cleanEntries, trimmed)
		}
	}

	if len(cleanEntries) == 0 {
		return m3uPath, nil, fmt.Errorf("m3u file '%s' is empty", filepath.Base(m3uPath))
	}

	dir := filepath.Dir(m3uPath)
	var dirFiles []os.DirEntry
	dirRead := false

	var resolvedAbs []string
	var resolvedRel []string
	anyRemapped := false

	for idx, entry := range cleanEntries {
		target := entry
		if !filepath.IsAbs(target) {
			target = filepath.Join(dir, entry)
		}
		if _, err := os.Stat(target); err == nil {
			resolvedAbs = append(resolvedAbs, target)
			resolvedRel = append(resolvedRel, entry)
			continue
		}

		// Fallback: search directory for slug-renamed disc file (e.g. ps1_<slug>_<suffix>.chd)
		if !dirRead {
			dirFiles, _ = os.ReadDir(dir)
			dirRead = true
		}
		wantSlug := slugifyRomFileName(entry)
		wantExt := strings.ToLower(filepath.Ext(entry))
		var matches []string
		for _, df := range dirFiles {
			if df.IsDir() {
				continue
			}
			fName := df.Name()
			fExt := strings.ToLower(filepath.Ext(fName))
			if wantExt != "" && fExt != wantExt {
				continue
			}
			if extractUploadedSlug(fName) == wantSlug {
				matches = append(matches, fName)
			}
		}
		sort.Strings(matches)
		if len(matches) > 0 {
			pick := matches[0]
			if idx < len(matches) {
				pick = matches[idx]
			}
			matchedPath := filepath.Join(dir, pick)
			log.Printf("[runner] M3U entry '%s' resolved via slug '%s' -> '%s'\n", entry, wantSlug, pick)
			resolvedAbs = append(resolvedAbs, matchedPath)
			resolvedRel = append(resolvedRel, pick)
			anyRemapped = true
		}
	}

	if len(resolvedAbs) == 0 {
		return "", nil, fmt.Errorf("missing disc file '%s' referenced by M3U '%s'", cleanEntries[0], filepath.Base(m3uPath))
	}

	// Single-disc M3U: resolve directly to disc image
	if len(resolvedAbs) == 1 {
		log.Printf("[runner] Single-disc M3U '%s' resolved directly to '%s'\n", m3uPath, resolvedAbs[0])
		return resolvedAbs[0], nil, nil
	}

	// Multi-disc: rewrite M3U if CRLF or slug remapping occurred
	if hasCR || anyRemapped {
		cleanContent := strings.Join(resolvedRel, "\n") + "\n"
		if err := os.WriteFile(m3uPath, []byte(cleanContent), 0644); err == nil {
			log.Printf("[runner] Updated M3U playlist in place: %s\n", m3uPath)
			return m3uPath, nil, nil
		}

		tempM3U := filepath.Join(os.TempDir(), fmt.Sprintf("homearcade_clean_%d_%s", time.Now().UnixNano(), filepath.Base(m3uPath)))
		if err := os.WriteFile(tempM3U, []byte(strings.Join(resolvedAbs, "\n")+"\n"), 0644); err == nil {
			return tempM3U, func() { _ = os.Remove(tempM3U) }, nil
		}
	}

	return m3uPath, nil, nil
}

func (s *CgoLibretroSession) Load(romPath, corePath string) error {
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

	C.input_cache_clear()

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

	// Query system info
	var needFullPath bool
	var validExts string
	if fnGetSysInfo, err := dlib.load("retro_get_system_info"); err == nil {
		var sysInfo C.struct_retro_system_info
		C.bridge_retro_get_system_info(fnGetSysInfo, &sysInfo)
		needFullPath = bool(sysInfo.need_fullpath)
		if sysInfo.valid_extensions != nil {
			validExts = C.GoString(sysInfo.valid_extensions)
		}
	}

	actualRomPath := romPath
	if strings.ToLower(filepath.Ext(romPath)) == ".zip" {
		extractedPath, tempDir, err := extractZippedRom(romPath, validExts)
		if err != nil {
			return fmt.Errorf("failed to extract zipped ROM '%s': %w", romPath, err)
		}
		actualRomPath = extractedPath
		s.cleanup = func() {
			_ = os.RemoveAll(tempDir)
		}
	}

	if strings.ToLower(filepath.Ext(actualRomPath)) == ".m3u" {
		resolvedPath, m3uCleanup, err := resolveM3uFile(actualRomPath)
		if err != nil {
			return fmt.Errorf("failed to resolve M3U '%s': %w", actualRomPath, err)
		}
		actualRomPath = resolvedPath
		if m3uCleanup != nil {
			prevCleanup := s.cleanup
			s.cleanup = func() {
				m3uCleanup()
				if prevCleanup != nil {
					prevCleanup()
				}
			}
		}
	}

	defer func() {
		if !s.isRunning && s.cleanup != nil {
			s.cleanup()
			s.cleanup = nil
		}
	}()

	// Prepare ROM loading path
	cPath := C.CString(actualRomPath)
	defer C.free(unsafe.Pointer(cPath))

	var ok C.bool
	ext := strings.ToLower(filepath.Ext(actualRomPath))
	// Disk systems (.chd, .iso, .cue, .m3u, .pbp, .cso) or files > 64MB must load from path directly
	isDiskOrLarge := false
	if ext == ".chd" || ext == ".iso" || ext == ".cue" || ext == ".m3u" || ext == ".pbp" || ext == ".cso" {
		isDiskOrLarge = true
	} else if fi, err := os.Stat(actualRomPath); err == nil && fi.Size() > 64*1024*1024 {
		isDiskOrLarge = true
	}

	if needFullPath || isDiskOrLarge {
		ok = C.bridge_load_game(fnLoadGame, cPath, nil, 0)
	} else {
		romBytes, err := os.ReadFile(actualRomPath)
		if err == nil && len(romBytes) > 0 {
			cData := C.CBytes(romBytes)
			defer C.free(cData)
			ok = C.bridge_load_game(fnLoadGame, cPath, cData, C.size_t(len(romBytes)))
		} else {
			ok = C.bridge_load_game(fnLoadGame, cPath, nil, 0)
		}
	}

	if !bool(ok) {
		return fmt.Errorf("retro_load_game returned false for ROM '%s' (actual: '%s', need_fullpath: %v)", romPath, actualRomPath, needFullPath)
	}

	// Bind controller ports 0 & 1 to standard Libretro Joypad
	if fnSetPort, err := dlib.load("retro_set_controller_port_device"); err == nil && fnSetPort != nil {
		C.bridge_retro_set_controller_port_device(fnSetPort, 0, C.RETRO_DEVICE_JOYPAD)
		C.bridge_retro_set_controller_port_device(fnSetPort, 1, C.RETRO_DEVICE_JOYPAD)
	}

	// Query AV info
	if fnGetAv, err := dlib.load("retro_get_system_av_info"); err == nil {
		var av C.struct_retro_system_av_info
		C.bridge_retro_get_system_av_info(fnGetAv, &av)
		s.frameMu.Lock()
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
		s.frameMu.Unlock()
	}

	s.stateMu.Lock()
	s.isRunning = true
	s.stateMu.Unlock()

	log.Printf("[runner:cgo] Libretro core loaded: %s (%dx%d @ %d FPS, Audio: %dHz)\n",
		corePath, s.geometry.Width, s.geometry.Height, s.geometry.FPS, s.geometry.SampleRate)

	return nil
}

func (s *CgoLibretroSession) Step() {
	s.stateMu.Lock()
	running := s.isRunning
	fn := s.fnRetroRun
	s.stateMu.Unlock()

	if !running || fn == nil {
		return
	}

	C.same_thread(fn)
}

func (s *CgoLibretroSession) GetFrame() ([]byte, encoder.PixelFormat) {
	s.frameMu.RLock()
	defer s.frameMu.RUnlock()
	return s.frameBuffer, s.geometry.PixelFormat
}

func (s *CgoLibretroSession) GetAudio() []int16 {
	s.audioMu.RLock()
	defer s.audioMu.RUnlock()
	return s.audioBuffer
}

func (s *CgoLibretroSession) SetInput(player int, state RetroInputState) {
	if player < 0 || player >= 4 {
		return
	}
	var l2, r2 C.int16_t
	if (state.Buttons & (1 << 12)) != 0 {
		l2 = 0x7FFF
	}
	if (state.Buttons & (1 << 13)) != 0 {
		r2 = 0x7FFF
	}
	C.input_cache_set_port(
		C.uint(player),
		C.uint32_t(state.Buttons),
		C.int16_t(int(state.AxisX)*256),
		C.int16_t(int(state.AxisY)*256),
		C.int16_t(int(state.RightAxisX)*256),
		C.int16_t(int(state.RightAxisY)*256),
		l2, r2,
	)
}

func (s *CgoLibretroSession) Serialize() ([]byte, error) {
	return []byte(fmt.Sprintf("CGO-STATE-%d", time.Now().Unix())), nil
}

func (s *CgoLibretroSession) Unserialize(data []byte) error {
	return nil
}

func (s *CgoLibretroSession) Close() error {
	s.stateMu.Lock()
	if !s.isRunning {
		s.stateMu.Unlock()
		return nil
	}
	s.isRunning = false
	fnUnload := s.fnRetroUnload
	fnDeinit := s.fnRetroDeinit
	cleanup := s.cleanup
	s.cleanup = nil
	s.stateMu.Unlock()

	if fnUnload != nil {
		C.bridge_call(fnUnload)
	}
	if fnDeinit != nil {
		C.bridge_call(fnDeinit)
	}
	C.same_thread_stop()

	if cleanup != nil {
		cleanup()
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
	s.frameMu.RLock()
	defer s.frameMu.RUnlock()
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

	s.frameMu.Lock()
	defer s.frameMu.Unlock()

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

	rowBytes := w * bytesPerPixel
	pitchBytes := int(pitch)
	totalDestBytes := rowBytes * h

	if len(s.frameBuffer) < totalDestBytes {
		s.frameBuffer = make([]byte, totalDestBytes)
	}

	if pitchBytes == rowBytes || pitchBytes <= 0 {
		srcSlice := unsafe.Slice((*byte)(data), totalDestBytes)
		copy(s.frameBuffer, srcSlice)
	} else {
		// Stride/pitch mismatch: unpack line-by-line into tightly packed buffer
		for y := 0; y < h; y++ {
			srcOffset := y * pitchBytes
			dstOffset := y * rowBytes
			srcLine := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(data)+uintptr(srcOffset))), rowBytes)
			copy(s.frameBuffer[dstOffset:dstOffset+rowBytes], srcLine)
		}
	}
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

	s.audioMu.Lock()
	defer s.audioMu.Unlock()

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
	// Filter debug logs (0); log INFO (1), WARN (2), and ERROR (3)
	if level < C.RETRO_LOG_INFO {
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
				s.frameMu.Lock()
				switch *fmtPtr {
				case C.RETRO_PIXEL_FORMAT_0RGB1555:
					s.geometry.PixelFormat = encoder.PixelFormat0RGB1555
				case C.RETRO_PIXEL_FORMAT_XRGB8888:
					s.geometry.PixelFormat = encoder.PixelFormatXRGB8888
				case C.RETRO_PIXEL_FORMAT_RGB565:
					s.geometry.PixelFormat = encoder.PixelFormatRGB565
				}
				s.frameMu.Unlock()
			}
			return true
		}
	case C.RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
		if data != nil {
			dataDir := os.Getenv("CABINET_DATA_DIR")
			if dataDir == "" {
				dataDir = "/data"
			}
			biosDir := filepath.Join(dataDir, "bios")
			_ = os.MkdirAll(biosDir, 0755)
			*(**C.char)(data) = C.CString(biosDir)
			return true
		}
	case C.RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
		if data != nil {
			dataDir := os.Getenv("CABINET_DATA_DIR")
			if dataDir == "" {
				dataDir = "/data"
			}
			savesDir := filepath.Join(dataDir, "saves")
			_ = os.MkdirAll(savesDir, 0755)
			*(**C.char)(data) = C.CString(savesDir)
			return true
		}
	case C.RETRO_ENVIRONMENT_GET_CAN_DUPE:
		if data != nil {
			*(*C.bool)(data) = true
			return true
		}
	case C.RETRO_ENVIRONMENT_SET_VARIABLES:
		return true
	case C.RETRO_ENVIRONMENT_GET_VARIABLE:
		if data != nil {
			v := (*C.struct_retro_variable)(data)
			if v.key != nil {
				key := C.GoString(v.key)
				if key == "parallel-n64-pak1" || key == "mupen64plus-pak1" {
					v.value = C.CString("memory")
					return true
				}
				if key == "parallel-n64-gfxplugin" {
					v.value = C.CString("angrylion")
					return true
				}
			}
		}
		return false
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
