package audio

/*
#cgo pkg-config: opus
#include "opus_encoder.h"
#include <stdlib.h>
*/
import "C"

import (
	"fmt"
	"log"
	"sync"
	"unsafe"
)

// OpusAudioEncoder encodes interleaved 16-bit PCM stereo into RFC 7587 compliant Opus packets
type OpusAudioEncoder struct {
	mu         sync.Mutex
	sampleRate int
	channels   int
	ctx        C.OpusContext
	outBuffer  []byte
}

// NewOpusAudioEncoder creates a native libopus real-time encoder
func NewOpusAudioEncoder(sampleRate, channels int) (*OpusAudioEncoder, error) {
	if sampleRate <= 0 {
		sampleRate = TargetSampleRate
	}
	if channels <= 0 {
		channels = 2
	}

	ctx := C.opus_create_encoder(C.int(sampleRate), C.int(channels))
	if ctx == nil {
		return nil, fmt.Errorf("failed to initialize libopus encoder (%d Hz, %d channels)", sampleRate, channels)
	}

	log.Printf("[audio:opus] Native libopus real-time encoder active (%d Hz stereo, 96kbps)\n", sampleRate)
	return &OpusAudioEncoder{
		sampleRate: sampleRate,
		channels:   channels,
		ctx:        ctx,
		outBuffer:  make([]byte, 1024),
	}, nil
}

// Encode converts frameSize stereo samples (960 per channel) into an Opus byte slice
func (e *OpusAudioEncoder) Encode(pcm []int16, frameSize int) ([]byte, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.ctx == nil {
		return nil, fmt.Errorf("opus encoder context closed")
	}

	if len(pcm) < frameSize*e.channels {
		return nil, fmt.Errorf("pcm buffer too small for frame size %d", frameSize)
	}

	bytesWritten := C.opus_encode_pcm(
		e.ctx,
		(*C.int16_t)(unsafe.Pointer(&pcm[0])),
		C.int(frameSize),
		(*C.uchar)(unsafe.Pointer(&e.outBuffer[0])),
		C.int(len(e.outBuffer)),
	)

	if bytesWritten < 0 {
		return nil, fmt.Errorf("opus_encode error code: %d", int(bytesWritten))
	}

	out := make([]byte, int(bytesWritten))
	copy(out, e.outBuffer[:bytesWritten])
	return out, nil
}

// Close releases the underlying C encoder context
func (e *OpusAudioEncoder) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.ctx != nil {
		C.opus_destroy_encoder(e.ctx)
		e.ctx = nil
	}
	return nil
}
