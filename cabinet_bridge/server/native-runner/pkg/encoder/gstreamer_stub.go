//go:build !gstreamer || !linux

package encoder

// NewActiveVideoEncoder creates the default video encoder on environments without GStreamer
func NewActiveVideoEncoder(width, height, fps int) VideoEncoder {
	return NewVP8StreamEncoder(width, height, fps)
}
