//go:build gstreamer && linux

package encoder

import (
	"fmt"
	"log"
	"time"
	"unsafe"

	"github.com/pion/webrtc/v4/pkg/media"
)

/*
#cgo pkg-config: gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0
#include <gst/gst.h>
#include <gst/app/gstappsrc.h>
#include <gst/app/gstappsink.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    GstElement *pipeline;
    GstAppSrc  *appsrc;
    GstAppSink *appsink;
} GstVideoCtx;

static inline GstVideoCtx* create_gst_video_pipeline(int width, int height, int fps, const char *format_str) {
    gst_init(NULL, NULL);
    char pipe_str[1024];
    snprintf(pipe_str, sizeof(pipe_str),
        "appsrc name=vsrc is-live=true format=time caps=\"video/x-raw,format=%s,width=%d,height=%d,framerate=%d/1\" ! "
        "videoconvert ! "
        "vp8enc deadline=1 cpu-used=8 name=venc ! "
        "appsink name=vsink sync=false max-buffers=1 drop=true",
        format_str, width, height, fps);

    GError *err = NULL;
    GstElement *pipeline = gst_parse_launch(pipe_str, &err);
    if (!pipeline || err) {
        if (err) g_error_free(err);
        return NULL;
    }

    GstVideoCtx *ctx = (GstVideoCtx*)malloc(sizeof(GstVideoCtx));
    ctx->pipeline = pipeline;
    ctx->appsrc = GST_APP_SRC(gst_bin_get_by_name(GST_BIN(pipeline), "vsrc"));
    ctx->appsink = GST_APP_SINK(gst_bin_get_by_name(GST_BIN(pipeline), "vsink"));
    gst_element_set_state(pipeline, GST_STATE_PLAYING);
    return ctx;
}

static inline int push_gst_video_frame(GstVideoCtx *ctx, const void *data, size_t size) {
    if (!ctx || !ctx->appsrc) return -1;
    GstBuffer *buf = gst_buffer_new_allocate(NULL, size, NULL);
    if (!buf) return -1;
    gst_buffer_fill(buf, 0, data, size);
    GstFlowReturn ret = gst_app_src_push_buffer(ctx->appsrc, buf);
    return (ret == GST_FLOW_OK) ? 0 : -1;
}

static inline void* pull_gst_video_sample(GstVideoCtx *ctx, size_t *out_size, int timeout_ms) {
    if (!ctx || !ctx->appsink) return NULL;
    GstSample *sample = gst_app_sink_try_pull_sample(ctx->appsink, timeout_ms * GST_MSECOND);
    if (!sample) return NULL;
    GstBuffer *buf = gst_sample_get_buffer(sample);
    if (!buf) {
        gst_sample_unref(sample);
        return NULL;
    }
    GstMapInfo map;
    if (!gst_buffer_map(buf, &map, GST_MAP_READ)) {
        gst_sample_unref(sample);
        return NULL;
    }
    void *copy = malloc(map.size);
    if (copy) {
        memcpy(copy, map.data, map.size);
        *out_size = map.size;
    }
    gst_buffer_unmap(buf, &map);
    gst_sample_unref(sample);
    return copy;
}

static inline void destroy_gst_video_pipeline(GstVideoCtx *ctx) {
    if (!ctx) return;
    if (ctx->pipeline) {
        gst_element_set_state(ctx->pipeline, GST_STATE_NULL);
        gst_object_unref(ctx->pipeline);
    }
    free(ctx);
}
*/
import "C"

type GStreamerVP8Encoder struct {
	width    int
	height   int
	fps      int
	duration time.Duration
	ctx      *C.GstVideoCtx
}

func NewGStreamerVP8Encoder(width, height, fps int) (*GStreamerVP8Encoder, error) {
	if fps <= 0 {
		fps = 60
	}
	cFmt := C.CString("BGRx")
	defer C.free(unsafe.Pointer(cFmt))

	ctx := C.create_gst_video_pipeline(C.int(width), C.int(height), C.int(fps), cFmt)
	if ctx == nil {
		return nil, fmt.Errorf("failed to create GStreamer VP8 encoding pipeline")
	}

	log.Printf("[encoder:gst] GStreamer VP8 encoder pipeline active (%dx%d @ %d FPS)\n", width, height, fps)
	return &GStreamerVP8Encoder{
		width:    width,
		height:   height,
		fps:      fps,
		duration: time.Duration(1000/fps) * time.Millisecond,
		ctx:      ctx,
	}, nil
}

func (g *GStreamerVP8Encoder) Encode(rawRGB []byte, format PixelFormat) (media.Sample, error) {
	if g.ctx == nil || len(rawRGB) == 0 {
		return media.Sample{}, fmt.Errorf("gstreamer encoder not ready or empty frame")
	}

	ret := C.push_gst_video_frame(g.ctx, unsafe.Pointer(&rawRGB[0]), C.size_t(len(rawRGB)))
	if ret != 0 {
		return media.Sample{}, fmt.Errorf("gstreamer failed to push frame")
	}

	var outSize C.size_t
	samplePtr := C.pull_gst_video_sample(g.ctx, &outSize, 10)
	if samplePtr == nil || outSize == 0 {
		// Delta frame or waiting for pipeline
		return media.Sample{}, fmt.Errorf("no sample ready")
	}
	defer C.free(samplePtr)

	outBytes := C.GoBytes(samplePtr, C.int(outSize))
	return media.Sample{
		Data:     outBytes,
		Duration: g.duration,
	}, nil
}

func (g *GStreamerVP8Encoder) Close() error {
	if g.ctx != nil {
		C.destroy_gst_video_pipeline(g.ctx)
		g.ctx = nil
	}
	return nil
}

// Factory to create active encoder
func NewActiveVideoEncoder(width, height, fps int) VideoEncoder {
	enc, err := NewGStreamerVP8Encoder(width, height, fps)
	if err == nil {
		return enc
	}
	log.Printf("[encoder] Warning: GStreamer init failed (%v), falling back to software stub\n", err)
	return NewVP8StreamEncoder(width, height, fps)
}
