#ifndef HOMEARCADE_OPUS_ENCODER_H
#define HOMEARCADE_OPUS_ENCODER_H

#include <stdint.h>
#include <stddef.h>

typedef void* OpusContext;

OpusContext opus_create_encoder(int sample_rate, int channels);
int opus_encode_pcm(OpusContext c, const int16_t *pcm, int frame_size, unsigned char *out_data, int max_data_bytes);
void opus_destroy_encoder(OpusContext c);

#endif // HOMEARCADE_OPUS_ENCODER_H
