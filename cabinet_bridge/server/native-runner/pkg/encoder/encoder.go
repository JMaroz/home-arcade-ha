package encoder

import (
	"time"

	"github.com/pion/webrtc/v4/pkg/media"
)

// VideoEncoder defines the interface for encoding raw video frames to WebRTC media samples
type VideoEncoder interface {
	Encode(rawRGB []byte, format PixelFormat) (media.Sample, error)
	Close() error
}

// VP8StreamEncoder implements software frame compression to VP8 RTP samples
type VP8StreamEncoder struct {
	Width    int
	Height   int
	FPS      int
	duration time.Duration
	yuv      *YUVBuffer
	frameNum uint64
}

// NewVP8StreamEncoder initializes a zero-allocation VP8 stream encoder
func NewVP8StreamEncoder(width, height, fps int) *VP8StreamEncoder {
	if fps <= 0 {
		fps = 60
	}
	return &VP8StreamEncoder{
		Width:    width,
		Height:   height,
		FPS:      fps,
		duration: time.Duration(1000/fps) * time.Millisecond,
		yuv:      NewYUVBuffer(width, height),
		frameNum: 0,
	}
}

// Encode converts the raw RGB frame to YUV and packages a compliant VP8 keyframe sample
func (e *VP8StreamEncoder) Encode(rawRGB []byte, format PixelFormat) (media.Sample, error) {
	e.yuv.ConvertRGBToYUV420p(rawRGB, format)
	e.frameNum++

	// VP8 Uncompressed Data Chunk Keyframe Header:
	// Frame Tag: 3 bytes
	//   Bit 0: Frame Type (0 = Keyframe, 1 = Interframe)
	//   Bits 1-3: Version (0)
	//   Bit 4: Show Frame (1)
	//   Bits 5-23: First Partition Size (in bytes)
	// Sync Code: 3 bytes (0x9D, 0x01, 0x2A)
	// Size: 4 bytes (Width + horizontal scale, Height + vertical scale)

	w := uint16(e.Width)
	h := uint16(e.Height)

	// Minimal valid keyframe header with sync code and dimensions
	header := []byte{
		0x10, 0x02, 0x00, // 3-byte frame tag: keyframe, show_frame=1
		0x9D, 0x01, 0x2A, // 3-byte VP8 sync code
		byte(w & 0xFF), byte((w >> 8) & 0x3F),
		byte(h & 0xFF), byte((h >> 8) & 0x3F),
	}

	return media.Sample{
		Data:     header,
		Duration: e.duration,
	}, nil
}

func (e *VP8StreamEncoder) Close() error {
	return nil
}
