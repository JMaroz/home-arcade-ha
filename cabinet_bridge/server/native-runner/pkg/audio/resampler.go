package audio

import (
	"sync"
	"time"

	"github.com/pion/webrtc/v4/pkg/media"
)

const (
	TargetSampleRate = 48000
	FrameDurationMs  = 20
	// 960 samples per channel at 48000 Hz for 20ms
	SamplesPerFrame = TargetSampleRate * FrameDurationMs / 1000 // 960
	StereoFrameSize = SamplesPerFrame * 2                       // 1920 int16 samples
)

// Resampler converts interleaved stereo 16-bit PCM from inRate to outRate using linear interpolation
type Resampler struct {
	InRate  int
	OutRate int
	ratio   float64
}

// NewResampler creates a resampler instance targeting 48000Hz stereo
func NewResampler(inRate int) *Resampler {
	if inRate <= 0 {
		inRate = 44100
	}
	return &Resampler{
		InRate:  inRate,
		OutRate: TargetSampleRate,
		ratio:   float64(inRate) / float64(TargetSampleRate),
	}
}

// ResampleStereo resamples interleaved stereo 16-bit PCM samples
func (r *Resampler) ResampleStereo(src []int16) []int16 {
	if r.InRate == r.OutRate {
		out := make([]int16, len(src))
		copy(out, src)
		return out
	}

	srcFrames := len(src) / 2
	if srcFrames < 2 {
		return nil
	}

	dstFrames := int(float64(srcFrames) / r.ratio)
	dst := make([]int16, dstFrames*2)

	for i := 0; i < dstFrames; i++ {
		srcIdx := float64(i) * r.ratio
		baseIdx := int(srcIdx)
		frac := srcIdx - float64(baseIdx)

		if baseIdx+1 >= srcFrames {
			baseIdx = srcFrames - 2
			frac = 1.0
		}

		// Channel 0 (Left)
		s0L := float64(src[baseIdx*2])
		s1L := float64(src[(baseIdx+1)*2])
		dst[i*2] = int16(s0L + frac*(s1L-s0L))

		// Channel 1 (Right)
		s0R := float64(src[baseIdx*2+1])
		s1R := float64(src[(baseIdx+1)*2+1])
		dst[i*2+1] = int16(s0R + frac*(s1R-s0R))
	}

	return dst
}

// AudioBufferAccumulator collects variable-size audio callbacks from Libretro
// and emits fixed 20ms Opus/PCM frames for WebRTC streaming.
type AudioBufferAccumulator struct {
	mu        sync.Mutex
	resampler *Resampler
	buffer    []int16
	duration  time.Duration
}

func NewAudioBufferAccumulator(inRate int) *AudioBufferAccumulator {
	return &AudioBufferAccumulator{
		resampler: NewResampler(inRate),
		buffer:    make([]int16, 0, StereoFrameSize*4),
		duration:  time.Duration(FrameDurationMs) * time.Millisecond,
	}
}

// Push adds input samples, resamples to 48kHz and returns any complete 20ms media.Sample frames
func (a *AudioBufferAccumulator) Push(srcPCM []int16) []media.Sample {
	a.mu.Lock()
	defer a.mu.Unlock()

	resampled := a.resampler.ResampleStereo(srcPCM)
	a.buffer = append(a.buffer, resampled...)

	var samples []media.Sample
	for len(a.buffer) >= StereoFrameSize {
		chunk := a.buffer[:StereoFrameSize]

		// Encode chunk into raw PCM bytes (little-endian)
		rawBytes := make([]byte, StereoFrameSize*2)
		for i, val := range chunk {
			rawBytes[i*2] = byte(val & 0xFF)
			rawBytes[i*2+1] = byte((val >> 8) & 0xFF)
		}

		samples = append(samples, media.Sample{
			Data:     rawBytes,
			Duration: a.duration,
		})

		a.buffer = a.buffer[StereoFrameSize:]
	}

	return samples
}
