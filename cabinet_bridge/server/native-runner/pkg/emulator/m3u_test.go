package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveM3uFile_SingleDiscCRLF(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "m3u-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create dummy target CHD file
	chdPath := filepath.Join(tempDir, "Ape Escape (USA).chd")
	if err := os.WriteFile(chdPath, []byte("CHD_MOCK_DATA"), 0644); err != nil {
		t.Fatalf("Failed to write mock chd: %v", err)
	}

	// Create M3U with Windows CRLF line ending (\r\n)
	m3uContent := "Ape Escape (USA).chd\r\n"
	m3uPath := filepath.Join(tempDir, "Ape Escape (USA).m3u")
	if err := os.WriteFile(m3uPath, []byte(m3uContent), 0644); err != nil {
		t.Fatalf("Failed to write m3u: %v", err)
	}

	resolved, cleanup, err := resolveM3uFile(m3uPath)
	if err != nil {
		t.Fatalf("resolveM3uFile failed: %v", err)
	}
	if cleanup != nil {
		defer cleanup()
	}

	if resolved != chdPath {
		t.Errorf("Expected resolved path '%s', got '%s'", chdPath, resolved)
	}
}

func TestResolveM3uFile_MultiDiscCRLF(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "m3u-test-multi-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	disc1 := filepath.Join(tempDir, "FF7 (Disc 1).chd")
	disc2 := filepath.Join(tempDir, "FF7 (Disc 2).chd")
	_ = os.WriteFile(disc1, []byte("D1"), 0644)
	_ = os.WriteFile(disc2, []byte("D2"), 0644)

	m3uContent := "FF7 (Disc 1).chd\r\nFF7 (Disc 2).chd\r\n"
	m3uPath := filepath.Join(tempDir, "FF7.m3u")
	if err := os.WriteFile(m3uPath, []byte(m3uContent), 0644); err != nil {
		t.Fatalf("Failed to write m3u: %v", err)
	}

	resolved, cleanup, err := resolveM3uFile(m3uPath)
	if err != nil {
		t.Fatalf("resolveM3uFile failed: %v", err)
	}
	if cleanup != nil {
		defer cleanup()
	}

	// Read resolved file content to verify no '\r' remains
	content, err := os.ReadFile(resolved)
	if err != nil {
		t.Fatalf("Failed to read resolved m3u: %v", err)
	}
	if strings.Contains(string(content), "\r") {
		t.Errorf("Resolved M3U still contains carriage return (\\r)")
	}
	if !strings.Contains(string(content), "FF7 (Disc 1).chd") || !strings.Contains(string(content), "FF7 (Disc 2).chd") {
		t.Errorf("Resolved M3U missing expected disc entries: %s", string(content))
	}
}
