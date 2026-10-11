#ifndef FRONTEND_H__
#define FRONTEND_H__

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "libretro.h"

void bridge_call(void *f);
void bridge_set_callback(void *f, void *callback);

bool bridge_retro_load_game(void *f, struct retro_game_info *gi);
bool bridge_load_game(void *f, const char *path, const void *data, size_t size);
bool bridge_retro_serialize(void *f, void *data, size_t size);
size_t bridge_retro_serialize_size(void *f);
bool bridge_retro_unserialize(void *f, void *data, size_t size);
bool bridge_retro_set_environment(void *f, void *callback);
unsigned bridge_retro_api_version(void *f);
size_t bridge_retro_get_memory_size(void *f, unsigned id);
void *bridge_retro_get_memory_data(void *f, unsigned id);
void bridge_context_reset(retro_hw_context_reset_t f);
void bridge_retro_get_system_av_info(void *f, struct retro_system_av_info *si);
void bridge_retro_get_system_info(void *f, struct retro_system_info *si);
void bridge_retro_set_controller_port_device(void *f, unsigned port, unsigned device);
void bridge_retro_set_input_state(void *f, void *callback);
void bridge_retro_keyboard_callback(void *f, bool down, unsigned keycode, uint32_t character, uint16_t keyModifiers);

void input_cache_set_port(unsigned port, uint32_t buttons,
                          int16_t lx, int16_t ly, int16_t rx, int16_t ry,
                          int16_t l2, int16_t r2);
void input_cache_set_keyboard_key(unsigned id, uint8_t pressed);
void input_cache_set_mouse(int16_t dx, int16_t dy, uint8_t buttons);
void input_cache_clear(void);
void input_cache_set_keyboard_bulk(const uint8_t *keys, size_t count);

bool core_environment_cgo(unsigned cmd, void *data);
int16_t core_input_state_cgo(unsigned port, unsigned device, unsigned index, unsigned id);
retro_proc_address_t core_get_proc_address_cgo(const char *sym);
size_t core_audio_sample_batch_cgo(const int16_t *data, size_t frames);
uintptr_t core_get_current_framebuffer_cgo();
void core_audio_sample_cgo(int16_t left, int16_t right);
void core_input_poll_cgo();
void core_log_cgo(int level, const char *msg);
void core_video_refresh_cgo(void *data, unsigned width, unsigned height, size_t pitch);
void init_video_cgo();
void deinit_video_cgo();

void same_thread(void *f);
void *same_thread_with_args2(void *f, int type, void *arg1, void *arg2);
void same_thread_stop();

static inline void call_audio_buffer_status(
	struct retro_audio_buffer_status_callback *cb,
	bool active, unsigned occupancy, bool underrun) {
	if (cb && cb->callback) cb->callback(active, occupancy, underrun);
}

static inline void call_frame_time_cb(
	struct retro_frame_time_callback *cb, retro_usec_t usec) {
	if (cb && cb->callback) cb->callback(usec);
}

#endif
