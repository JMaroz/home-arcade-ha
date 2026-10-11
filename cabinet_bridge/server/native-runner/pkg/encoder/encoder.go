package encoder

import (
	"log"
	"time"

	"github.com/pion/webrtc/v4/pkg/media"
)

// VideoEncoder defines the interface for encoding raw video frames to WebRTC media samples
type VideoEncoder interface {
	Encode(rawRGB []byte, format PixelFormat, width, height int) (media.Sample, error)
	Close() error
}

// VP8StreamEncoder implements fallback frame handling
type VP8StreamEncoder struct {
	Width    int
	Height   int
	FPS      int
	duration time.Duration
	yuv      *YUVBuffer
	frameNum uint64
}

// NewVP8StreamEncoder initializes a fallback VP8 stream encoder
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

// Encode converts the raw RGB frame to YUV and packages a basic keyframe sample
func (e *VP8StreamEncoder) Encode(rawRGB []byte, format PixelFormat, width, height int) (media.Sample, error) {
	e.yuv.ConvertRGBToYUV420p(rawRGB, format)
	e.frameNum++

	w := uint16(e.Width)
	h := uint16(e.Height)
	if width > 0 && height > 0 {
		w = uint16(width)
		h = uint16(height)
	}

	header := []byte{
		0x10, 0x02, 0x00,
		0x9D, 0x01, 0x2A,
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

// NewActiveVideoEncoder creates the best available video encoder (libvpx native first)
func NewActiveVideoEncoder(width, height, fps int) VideoEncoder {
	enc, err := NewVpxVideoEncoder(width, height, fps)
	if err == nil {
		return enc
	}
	log.Printf("[encoder] Warning: native libvpx init failed (%v), falling back to basic encoder\n", err)
	return NewVP8StreamEncoder(width, height, fps)
}
