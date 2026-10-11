#ifndef VPX_BRIDGE_H
#define VPX_BRIDGE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void* VpxContext;

VpxContext vpx_create_encoder(int width, int height, int fps, int bitrate_kbps);
void* vpx_encode_yuv(VpxContext ctx, const uint8_t *yuv420, size_t *out_size, int force_keyframe);
void vpx_destroy_encoder(VpxContext ctx);

#ifdef __cplusplus
}
#endif

#endif // VPX_BRIDGE_H
