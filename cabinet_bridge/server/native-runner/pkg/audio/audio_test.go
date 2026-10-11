package audio

import (
	"testing"
)

func TestResampler_LinearInterpolation(t *testing.T) {
	// Resample 44100 Hz to 48000 Hz
	r := NewResampler(44100)

	// Create 100 stereo frames of a 440Hz sine-like step
	src := make([]int16, 200)
	for i := 0; i < len(src); i += 2 {
		src[i] = int16(i * 100)
		src[i+1] = int16(-i * 100)
	}

	out := r.ResampleStereo(src)
	if len(out) == 0 {
		t.Fatalf("Resampling failed, got empty output")
	}

	// 100 frames at 44100 -> ~108 frames at 48000
	ratio := float64(100) * (48000.0 / 44100.0)
	expectedFrames := int(ratio)
	outFrames := len(out) / 2
	diff := outFrames - expectedFrames
	if diff < -2 || diff > 2 {
		t.Fatalf("Expected ~%d frames, got %d", expectedFrames, outFrames)
	}
}

func TestAudioBufferAccumulator_FrameChunks(t *testing.T) {
	acc := NewAudioBufferAccumulator(48000)

	// Feeding exactly 1920 samples (1 frame of 20ms at 48kHz stereo)
	input := make([]int16, StereoFrameSize)
	for i := range input {
		input[i] = 1000
	}

	samples := acc.Push(input)
	if len(samples) != 1 {
		t.Fatalf("Expected exactly 1 media.Sample, got %d", len(samples))
	}
	if len(samples[0].Data) != StereoFrameSize*2 {
		t.Fatalf("Expected byte length %d, got %d", StereoFrameSize*2, len(samples[0].Data))
	}

	// Feeding another half-frame: should accumulate with 0 output
	halfInput := make([]int16, StereoFrameSize/2)
	samples2 := acc.Push(halfInput)
	if len(samples2) != 0 {
		t.Fatalf("Expected 0 samples for partial frame, got %d", len(samples2))
	}

	// Feeding second half: should emit 1 frame
	samples3 := acc.Push(halfInput)
	if len(samples3) != 1 {
		t.Fatalf("Expected 1 sample after completing buffer, got %d", len(samples3))
	}
}
