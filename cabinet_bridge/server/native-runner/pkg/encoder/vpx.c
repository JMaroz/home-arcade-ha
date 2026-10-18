#include "vpx.h"
#include <vpx/vpx_encoder.h>
#include <vpx/vp8cx.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    vpx_codec_ctx_t codec;
    vpx_image_t     raw;
    int              width;
    int              height;
    int              frame_count;
} VpxInternal;

VpxContext vpx_create_encoder(int width, int height, int fps, int bitrate_kbps) {
    if (width <= 0 || height <= 0) return NULL;
    if (fps <= 0) fps = 60;
    if (bitrate_kbps <= 0) bitrate_kbps = 2500;

    // libvpx requires even dimensions for I420
    if (width % 2 != 0) width++;
    if (height % 2 != 0) height++;

    VpxInternal *ctx = (VpxInternal*)calloc(1, sizeof(VpxInternal));
    if (!ctx) return NULL;

    ctx->width = width;
    ctx->height = height;
    ctx->frame_count = 0;

    vpx_codec_enc_cfg_t cfg;
    if (vpx_codec_enc_config_default(vpx_codec_vp8_cx(), &cfg, 0) != VPX_CODEC_OK) {
        free(ctx);
        return NULL;
    }

    cfg.g_w = width;
    cfg.g_h = height;
    cfg.g_timebase.num = 1;
    cfg.g_timebase.den = fps;
    cfg.rc_target_bitrate = bitrate_kbps;
    cfg.g_error_resilient = VPX_ERROR_RESILIENT_DEFAULT;
    cfg.g_lag_in_frames = 0; // Ultra-low latency: zero frame delay
    cfg.rc_end_usage = VPX_CBR;
    cfg.rc_min_quantizer = 2;
    cfg.rc_max_quantizer = 56;
    cfg.rc_undershoot_pct = 95;
    cfg.g_threads = 2;

    if (vpx_codec_enc_init(&ctx->codec, vpx_codec_vp8_cx(), &cfg, 0) != VPX_CODEC_OK) {
        free(ctx);
        return NULL;
    }

    // Set fastest CPU utilization for real-time gaming
    vpx_codec_control(&ctx->codec, VP8E_SET_CPUUSED, 8);
    vpx_codec_control(&ctx->codec, VP8E_SET_STATIC_THRESHOLD, 1);
    vpx_codec_control(&ctx->codec, VP8E_SET_NOISE_SENSITIVITY, 0);

    if (!vpx_img_alloc(&ctx->raw, VPX_IMG_FMT_I420, width, height, 1)) {
        vpx_codec_destroy(&ctx->codec);
        free(ctx);
        return NULL;
    }

    return (VpxContext)ctx;
}

void* vpx_encode_yuv(VpxContext c, const uint8_t *yuv420, size_t *out_size, int force_keyframe) {
    if (!c || !yuv420 || !out_size) return NULL;
    VpxInternal *ctx = (VpxInternal*)c;

    ctx->frame_count++;

    int w = ctx->width;
    int h = ctx->height;
    int y_size = w * h;
    int uv_size = (w / 2) * (h / 2);

    memcpy(ctx->raw.planes[VPX_PLANE_Y], yuv420, y_size);
    memcpy(ctx->raw.planes[VPX_PLANE_U], yuv420 + y_size, uv_size);
    memcpy(ctx->raw.planes[VPX_PLANE_V], yuv420 + y_size + uv_size, uv_size);

    vpx_enc_frame_flags_t flags = 0;
    // Always force keyframe on first frame or every 300 frames (~5 seconds at 60 FPS)
    if (force_keyframe || ctx->frame_count == 1 || (ctx->frame_count % 300 == 0)) {
        flags |= VPX_EFLAG_FORCE_KF;
    }

    if (vpx_codec_encode(&ctx->codec, &ctx->raw, ctx->frame_count, 1, flags, VPX_DL_REALTIME) != VPX_CODEC_OK) {
        return NULL;
    }

    vpx_codec_iter_t iter = NULL;
    const vpx_codec_cx_pkt_t *pkt = vpx_codec_get_cx_data(&ctx->codec, &iter);
    if (!pkt || pkt->kind != VPX_CODEC_CX_FRAME_PKT) {
        return NULL;
    }

    void *out = malloc(pkt->data.frame.sz);
    if (!out) return NULL;

    memcpy(out, pkt->data.frame.buf, pkt->data.frame.sz);
    *out_size = pkt->data.frame.sz;
    return out;
}

void vpx_destroy_encoder(VpxContext c) {
    if (!c) return;
    VpxInternal *ctx = (VpxInternal*)c;
    vpx_img_free(&ctx->raw);
    vpx_codec_destroy(&ctx->codec);
    free(ctx);
}
