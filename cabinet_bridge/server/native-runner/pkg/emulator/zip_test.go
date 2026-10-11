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
