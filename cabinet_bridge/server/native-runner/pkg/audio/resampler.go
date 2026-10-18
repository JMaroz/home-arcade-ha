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
	phase   float64
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
		phase:   0,
	}
}

// ResampleStereo resamples interleaved stereo 16-bit PCM samples with phase continuity
func (r *Resampler) ResampleStereo(src []int16) []int16 {
	if r.InRate == r.OutRate {
		out := make([]int16, len(src))
		copy(out, src)
		return out
	}

	srcFrames := len(src) / 2
	if srcFrames == 0 {
		return nil
	}

	estDstFrames := int((float64(srcFrames) - r.phase) / r.ratio) + 2
	if estDstFrames < 0 {
		estDstFrames = 0
	}
	dst := make([]int16, 0, estDstFrames*2)

	for r.phase < float64(srcFrames) {
		baseIdx := int(r.phase)
		frac := r.phase - float64(baseIdx)

		s0L := float64(src[baseIdx*2])
		s0R := float64(src[baseIdx*2+1])

		var s1L, s1R float64
		if baseIdx+1 < srcFrames {
			s1L = float64(src[(baseIdx+1)*2])
			s1R = float64(src[(baseIdx+1)*2+1])
		} else {
			s1L = s0L
			s1R = s0R
		}

		outL := int16(s0L + frac*(s1L-s0L))
		outR := int16(s0R + frac*(s1R-s0R))
		dst = append(dst, outL, outR)

		r.phase += r.ratio
	}

	r.phase -= float64(srcFrames)
	if r.phase < 0 {
		r.phase = 0
	}

	return dst
}

// AudioEncoder abstracts encoding PCM stereo samples into WebRTC media bytes
type AudioEncoder interface {
	Encode(pcm []int16, frameSize int) ([]byte, error)
	Close() error
}

// FallbackRawAudioEncoder wraps uncompressed PCM (used only as fallback if libopus is unavailable)
type FallbackRawAudioEncoder struct{}

func (f *FallbackRawAudioEncoder) Encode(pcm []int16, frameSize int) ([]byte, error) {
	count := frameSize * 2
	rawBytes := make([]byte, count*2)
	for i := 0; i < count && i < len(pcm); i++ {
		val := pcm[i]
		rawBytes[i*2] = byte(val & 0xFF)
		rawBytes[i*2+1] = byte((val >> 8) & 0xFF)
	}
	return rawBytes, nil
}

func (f *FallbackRawAudioEncoder) Close() error {
	return nil
}

// NewActiveAudioEncoder returns native libopus encoder, or fallback if unavailable
func NewActiveAudioEncoder(sampleRate, channels int) AudioEncoder {
	enc, err := NewOpusAudioEncoder(sampleRate, channels)
	if err == nil {
		return enc
	}
	return &FallbackRawAudioEncoder{}
}

// AudioBufferAccumulator collects variable-size audio callbacks from Libretro
// and emits fixed 20ms Opus/PCM frames for WebRTC streaming.
type AudioBufferAccumulator struct {
	mu        sync.Mutex
	resampler *Resampler
	encoder   AudioEncoder
	buffer    []int16
	duration  time.Duration
}

func NewAudioBufferAccumulator(inRate int) *AudioBufferAccumulator {
	return NewAudioBufferAccumulatorWithEncoder(inRate, NewActiveAudioEncoder(TargetSampleRate, 2))
}

func NewAudioBufferAccumulatorWithEncoder(inRate int, enc AudioEncoder) *AudioBufferAccumulator {
	return &AudioBufferAccumulator{
		resampler: NewResampler(inRate),
		encoder:   enc,
		buffer:    make([]int16, 0, StereoFrameSize*4),
		duration:  time.Duration(FrameDurationMs) * time.Millisecond,
	}
}

// Close cleans up the underlying audio encoder
func (a *AudioBufferAccumulator) Close() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.encoder != nil {
		return a.encoder.Close()
	}
	return nil
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

		var packetData []byte
		if a.encoder != nil {
			encoded, err := a.encoder.Encode(chunk, SamplesPerFrame)
			if err == nil && len(encoded) > 0 {
				packetData = encoded
			}
		}
		if len(packetData) == 0 {
			// Fallback: raw PCM bytes
			packetData = make([]byte, StereoFrameSize*2)
			for i, val := range chunk {
				packetData[i*2] = byte(val & 0xFF)
				packetData[i*2+1] = byte((val >> 8) & 0xFF)
			}
		}

		samples = append(samples, media.Sample{
			Data:     packetData,
			Duration: a.duration,
		})

		a.buffer = a.buffer[StereoFrameSize:]
	}

	return samples
}
