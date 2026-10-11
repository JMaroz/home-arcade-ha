package encoder

import (
	"testing"
)

func TestYUVBuffer_Allocation(t *testing.T) {
	buf := NewYUVBuffer(640, 480)
	expectedSize := 640*480 + (320 * 240 * 2) // 460800 bytes
	if len(buf.Data) != expectedSize {
		t.Fatalf("Expected buffer size %d, got %d", expectedSize, len(buf.Data))
	}
}

func TestYUVBuffer_ConvertXRGB8888(t *testing.T) {
	width, height := 4, 4
	buf := NewYUVBuffer(width, height)

	// Create 4x4 white image (R=255, G=255, B=255) in XRGB8888 (4 bytes per pixel)
	src := make([]byte, width*height*4)
	for i := 0; i < len(src); i += 4 {
		src[i] = 255   // B
		src[i+1] = 255 // G
		src[i+2] = 255 // R
		src[i+3] = 0   // X
	}

	buf.ConvertRGBToYUV420p(src, PixelFormatXRGB8888)

	// In BT.601, pure white Y is around 235 (studio range)
	yPlane := buf.Data[buf.yOffset:buf.uOffset]
	if yPlane[0] < 230 || yPlane[0] > 240 {
		t.Fatalf("Expected white Y around 235, got %d", yPlane[0])
	}

	// For white, U and V should be neutral (around 128)
	uPlane := buf.Data[buf.uOffset:buf.vOffset]
	vPlane := buf.Data[buf.vOffset:]
	if uPlane[0] < 126 || uPlane[0] > 130 {
		t.Fatalf("Expected white U around 128, got %d", uPlane[0])
	}
	if vPlane[0] < 126 || vPlane[0] > 130 {
		t.Fatalf("Expected white V around 128, got %d", vPlane[0])
	}
}

func TestYUVBuffer_ConvertRGB565(t *testing.T) {
	width, height := 2, 2
	buf := NewYUVBuffer(width, height)

	// Pure green in RGB565: (0 << 11) | (63 << 5) | 0 = 0x07E0
	src := []byte{
		0xE0, 0x07, 0xE0, 0x07,
		0xE0, 0x07, 0xE0, 0x07,
	}

	buf.ConvertRGBToYUV420p(src, PixelFormatRGB565)

	yPlane := buf.Data[buf.yOffset:buf.uOffset]
	// Green produces Y > 100
	if yPlane[0] < 100 {
		t.Fatalf("Expected green Y > 100, got %d", yPlane[0])
	}
}
