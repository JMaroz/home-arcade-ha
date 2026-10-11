package encoder

import (
	"testing"
)

func TestVpxVideoEncoder_RealFrameEncode(t *testing.T) {
	width := 240
	height := 160
	fps := 60

	enc, err := NewVpxVideoEncoder(width, height, fps)
	if err != nil {
		t.Fatalf("Failed to initialize VpxVideoEncoder: %v", err)
	}
	defer enc.Close()

	// Create test RGB565 frame
	rawRGB := make([]byte, width*height*2)
	for i := range rawRGB {
		rawRGB[i] = byte(i % 256)
	}

	sample, err := enc.Encode(rawRGB, PixelFormatRGB565, width, height)
	if err != nil {
		t.Fatalf("VpxVideoEncoder.Encode failed: %v", err)
	}

	if len(sample.Data) < 10 {
		t.Fatalf("Encoded sample size too small: %d bytes", len(sample.Data))
	}

	// Verify VP8 keyframe sync code (bytes 3-5 in standard uncompressed VP8 header)
	// Frame tag: 3 bytes
	// Sync code: 0x9D, 0x01, 0x2A
	if len(sample.Data) >= 6 {
		syncCode := sample.Data[3:6]
		if syncCode[0] != 0x9D || syncCode[1] != 0x01 || syncCode[2] != 0x2A {
			t.Errorf("Expected VP8 sync code [0x9D, 0x01, 0x2A], got %X", syncCode)
		}
	}

	t.Logf("Successfully encoded frame: %d bytes (Duration: %v)", len(sample.Data), sample.Duration)
}
