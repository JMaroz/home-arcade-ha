#include "opus_encoder.h"
#include <opus.h>
#include <stdlib.h>

OpusContext opus_create_encoder(int sample_rate, int channels) {
    if (sample_rate <= 0) sample_rate = 48000;
    if (channels <= 0) channels = 2;

    int err = 0;
    OpusEncoder *enc = opus_encoder_create(sample_rate, channels, OPUS_APPLICATION_RESTRICTED_LOWDELAY, &err);
    if (err != OPUS_OK || !enc) {
        return NULL;
    }

    // Configure for low-latency gaming audio with packet loss resilience
    opus_encoder_ctl(enc, OPUS_SET_SIGNAL(OPUS_SIGNAL_MUSIC));
    opus_encoder_ctl(enc, OPUS_SET_COMPLEXITY(4));
    opus_encoder_ctl(enc, OPUS_SET_BITRATE(96000));
    opus_encoder_ctl(enc, OPUS_SET_INBAND_FEC(1));
    opus_encoder_ctl(enc, OPUS_SET_PACKET_LOSS_PERC(5));
    return (OpusContext)enc;
}

int opus_encode_pcm(OpusContext c, const int16_t *pcm, int frame_size, unsigned char *out_data, int max_data_bytes) {
    if (!c || !pcm || !out_data || frame_size <= 0 || max_data_bytes <= 0) {
        return -1;
    }
    OpusEncoder *enc = (OpusEncoder*)c;
    return opus_encode(enc, pcm, frame_size, out_data, max_data_bytes);
}

void opus_destroy_encoder(OpusContext c) {
    if (c) {
        opus_encoder_destroy((OpusEncoder*)c);
    }
}
