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
	if len(samples[0].Data) == 0 {
		t.Fatalf("Expected non-empty media.Sample data, got 0 bytes")
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
	if len(samples3[0].Data) == 0 {
		t.Fatalf("Expected non-empty media.Sample data, got 0 bytes")
	}
}

func TestOpusAudioEncoder_Encode(t *testing.T) {
	enc, err := NewOpusAudioEncoder(48000, 2)
	if err != nil {
		t.Skipf("libopus not available: %v", err)
	}
	defer enc.Close()

	pcm := make([]int16, StereoFrameSize)
	for i := range pcm {
		pcm[i] = int16(i % 1000)
	}

	packet, err := enc.Encode(pcm, SamplesPerFrame)
	if err != nil {
		t.Fatalf("Opus encoding failed: %v", err)
	}
	if len(packet) == 0 || len(packet) >= StereoFrameSize*2 {
		t.Fatalf("Expected compressed Opus packet size, got %d bytes", len(packet))
	}
}

func TestResampler_MultiFrameContinuous(t *testing.T) {
	// Test 1 second of 44100Hz audio fed in 60 frames (735 samples each)
	accPS1 := NewAudioBufferAccumulatorWithEncoder(44100, &FallbackRawAudioEncoder{})
	defer accPS1.Close()

	totalPacketsPS1 := 0
	framePS1 := make([]int16, 735*2)
	for i := range framePS1 {
		framePS1[i] = 500
	}
	for f := 0; f < 60; f++ {
		samples := accPS1.Push(framePS1)
		totalPacketsPS1 += len(samples)
	}
	if totalPacketsPS1 != 50 {
		t.Fatalf("Expected 50 20ms packets (1000ms) for 1s of 44100Hz audio, got %d", totalPacketsPS1)
	}

	// Test 1 second of 65536Hz audio fed in 60 frames (variable sample count totaling 65536)
	accGBA := NewAudioBufferAccumulatorWithEncoder(65536, &FallbackRawAudioEncoder{})
	defer accGBA.Close()

	totalPacketsGBA := 0
	for f := 0; f < 60; f++ {
		count := 1092
		if f < 16 {
			count = 1093
		}
		frameGBA := make([]int16, count*2)
		for i := range frameGBA {
			frameGBA[i] = 500
		}
		samples := accGBA.Push(frameGBA)
		totalPacketsGBA += len(samples)
	}
	if totalPacketsGBA != 50 {
		t.Fatalf("Expected 50 20ms packets (1000ms) for 1s of 65536Hz audio, got %d", totalPacketsGBA)
	}
}

