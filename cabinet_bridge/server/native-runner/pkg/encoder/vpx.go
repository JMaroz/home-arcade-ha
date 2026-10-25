package encoder

/*
#cgo pkg-config: vpx
#include "vpx.h"
#include <stdlib.h>
*/
import "C"

import (
	"fmt"
	"log"
	"sync"
	"time"
	"unsafe"

	"github.com/pion/webrtc/v4/pkg/media"
)

// VpxVideoEncoder encodes raw RGB frames into compliant VP8 WebRTC media samples via libvpx
type VpxVideoEncoder struct {
	mu       sync.Mutex
	width    int
	height   int
	fps      int
	duration time.Duration
	ctx      C.VpxContext
	yuv      *YUVBuffer
}

// NewVpxVideoEncoder initializes a native libvpx real-time VP8 encoder
func NewVpxVideoEncoder(width, height, fps int) (*VpxVideoEncoder, error) {
	if fps <= 0 {
		fps = 60
	}
	if width <= 0 {
		width = 640
	}
	if height <= 0 {
		height = 480
	}

	ctx := C.vpx_create_encoder(C.int(width), C.int(height), C.int(fps), 1500)
	if ctx == nil {
		return nil, fmt.Errorf("failed to initialize libvpx VP8 encoder (%dx%d @ %d FPS)", width, height, fps)
	}

	log.Printf("[encoder:vpx] Native libvpx VP8 real-time encoder active (%dx%d @ %d FPS)\n", width, height, fps)
	return &VpxVideoEncoder{
		width:    width,
		height:   height,
		fps:      fps,
		duration: time.Second / time.Duration(fps),
		ctx:      ctx,
		yuv:      NewYUVBuffer(width, height),
	}, nil
}

func (v *VpxVideoEncoder) reconfigure(w, h int) error {
	if w <= 0 || h <= 0 {
		return nil
	}
	if v.ctx != nil {
		C.vpx_destroy_encoder(v.ctx)
		v.ctx = nil
	}
	newCtx := C.vpx_create_encoder(C.int(w), C.int(h), C.int(v.fps), 1500)
	if newCtx == nil {
		return fmt.Errorf("failed to reconfigure libvpx encoder for %dx%d", w, h)
	}
	v.ctx = newCtx
	v.width = w
	v.height = h
	v.yuv = NewYUVBuffer(w, h)
	log.Printf("[encoder:vpx] Resolution updated: %dx%d @ %d FPS\n", w, h, v.fps)
	return nil
}

// Encode converts the source frame to YUV420p and produces an RFC-compliant VP8 compressed packet
func (v *VpxVideoEncoder) Encode(rawRGB []byte, format PixelFormat, width, height int) (media.Sample, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if len(rawRGB) == 0 {
		return media.Sample{}, fmt.Errorf("empty raw frame")
	}

	if width > 0 && height > 0 && (width != v.width || height != v.height) {
		if err := v.reconfigure(width, height); err != nil {
			return media.Sample{}, err
		}
	}

	if v.ctx == nil || v.yuv == nil {
		return media.Sample{}, fmt.Errorf("encoder context not initialized")
	}

	v.yuv.ConvertRGBToYUV420p(rawRGB, format)

	var outSize C.size_t
	samplePtr := C.vpx_encode_yuv(
		v.ctx,
		(*C.uint8_t)(unsafe.Pointer(&v.yuv.Data[0])),
		&outSize,
		0,
	)

	if samplePtr == nil || outSize == 0 {
		return media.Sample{}, fmt.Errorf("libvpx returned empty sample")
	}
	defer C.free(samplePtr)

	outBytes := C.GoBytes(samplePtr, C.int(outSize))
	return media.Sample{
		Data:     outBytes,
		Duration: v.duration,
	}, nil
}

// Close releases the libvpx encoder instance
func (v *VpxVideoEncoder) Close() error {
	v.mu.Lock()
	defer v.mu.Unlock()

	if v.ctx != nil {
		C.vpx_destroy_encoder(v.ctx)
		v.ctx = nil
	}
	return nil
}
