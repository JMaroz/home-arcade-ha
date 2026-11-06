package emulator

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestExtractZippedRom(t *testing.T) {
	// Create an in-memory zip archive
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// 1. A readme txt file
	fTxt, err := zw.Create("readme.txt")
	if err != nil {
		t.Fatalf("Failed to create readme.txt in zip: %v", err)
	}
	fTxt.Write([]byte("This is a readme"))

	// 2. A mac hidden file
	fMac, err := zw.Create("__MACOSX/._game.z64")
	if err != nil {
		t.Fatalf("Failed to create mac metadata in zip: %v", err)
	}
	fMac.Write([]byte{0x00, 0x01})

	// 3. The actual rom file
	expectedData := []byte("N64_MOCK_ROM_DATA_12345")
	fRom, err := zw.Create("game.z64")
	if err != nil {
		t.Fatalf("Failed to create game.z64 in zip: %v", err)
	}
	fRom.Write(expectedData)

	if err := zw.Close(); err != nil {
		t.Fatalf("Failed to close zip writer: %v", err)
	}

	// Write zip to a temp file
	tmpZip, err := os.CreateTemp("", "test-rom-*.zip")
	if err != nil {
		t.Fatalf("Failed to create temp zip file: %v", err)
	}
	defer os.Remove(tmpZip.Name())

	if _, err := tmpZip.Write(buf.Bytes()); err != nil {
		t.Fatalf("Failed to write to temp zip: %v", err)
	}
	tmpZip.Close()

	// Run extractZippedRom
	extractedRomPath, tempDir, err := extractZippedRom(tmpZip.Name(), "z64|n64|v64")
	if err != nil {
		t.Fatalf("extractZippedRom failed: %v", err)
	}
	defer os.RemoveAll(tempDir)

	if filepath.Base(extractedRomPath) != "game.z64" {
		t.Errorf("Expected extracted file 'game.z64', got '%s'", filepath.Base(extractedRomPath))
	}

	content, err := os.ReadFile(extractedRomPath)
	if err != nil {
		t.Fatalf("Failed to read extracted rom: %v", err)
	}
	if !bytes.Equal(content, expectedData) {
		t.Errorf("Extracted content mismatch: got %v, want %v", content, expectedData)
	}
}

func TestShouldExtractZippedRom(t *testing.T) {
	tests := []struct {
		name         string
		blockExtract bool
		corePath     string
		system       string
		romPath      string
		validExts    string
		needFullPath bool
		wantExtract  bool
	}{
		{
			name:         "N64 console ROM should be extracted",
			blockExtract: false,
			corePath:     "/data/cores/parallel_n64_libretro.so",
			system:       "n64",
			romPath:      "/media/Roms/n64/mario.zip",
			validExts:    "z64|n64|v64",
			needFullPath: false,
			wantExtract:  true,
		},
		{
			name:         "SNES console ROM should be extracted",
			blockExtract: false,
			corePath:     "/data/cores/snes9x_libretro.so",
			system:       "snes",
			romPath:      "/media/Roms/snes/smw.zip",
			validExts:    "smc|sfc|swc|fig",
			needFullPath: false,
			wantExtract:  true,
		},
		{
			name:         "GBA console ROM should be extracted",
			blockExtract: false,
			corePath:     "/data/cores/mgba_libretro.so",
			system:       "gba",
			romPath:      "/media/Roms/gba/pokemon.zip",
			validExts:    "gba",
			needFullPath: false,
			wantExtract:  true,
		},
		{
			name:         "Neo Geo ROM with FBNeo must NOT be extracted",
			blockExtract: true,
			corePath:     "/data/cores/fbneo_libretro.so",
			system:       "neogeo",
			romPath:      "/media/Roms/neogeo/mslug.zip",
			validExts:    "zip|7z",
			needFullPath: true,
			wantExtract:  false,
		},
		{
			name:         "Arcade ROM with FBNeo must NOT be extracted even if block_extract was false",
			blockExtract: false,
			corePath:     "/data/cores/fbneo_libretro.so",
			system:       "arcade",
			romPath:      "/media/Roms/arcade/aerofgt.zip",
			validExts:    "zip|7z",
			needFullPath: true,
			wantExtract:  false,
		},
		{
			name:         "MAME core must NOT extract zip files",
			blockExtract: false,
			corePath:     "/data/cores/mame2003_plus_libretro.so",
			system:       "mame",
			romPath:      "/media/Roms/mame/pacman.zip",
			validExts:    "zip|7z",
			needFullPath: true,
			wantExtract:  false,
		},
		{
			name:         "Core with block_extract flag true must NOT extract",
			blockExtract: true,
			corePath:     "/data/cores/custom_core_libretro.so",
			system:       "generic",
			romPath:      "/media/Roms/custom/game.zip",
			validExts:    "bin",
			needFullPath: false,
			wantExtract:  false,
		},
		{
			name:         "Core declaring zip in valid_extensions and need_fullpath must NOT extract",
			blockExtract: false,
			corePath:     "/data/cores/some_archive_core_libretro.so",
			system:       "other",
			romPath:      "/media/Roms/other/archive.zip",
			validExts:    "zip|7z",
			needFullPath: true,
			wantExtract:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldExtractZippedRom(tt.blockExtract, tt.corePath, tt.system, tt.romPath, tt.validExts, tt.needFullPath)
			if got != tt.wantExtract {
				t.Errorf("ShouldExtractZippedRom() = %v, want %v", got, tt.wantExtract)
			}
		})
	}
}
