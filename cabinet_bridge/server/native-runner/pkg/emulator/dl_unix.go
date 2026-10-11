//go:build !windows

package emulator

import (
	"fmt"
	"unsafe"
)

/*
#cgo linux LDFLAGS: -ldl
#include <stdlib.h>
#include <dlfcn.h>
*/
import "C"

type dynamicLib struct {
	ptr unsafe.Pointer
}

func openDynamicLib(file string) (*dynamicLib, error) {
	cs := C.CString(file)
	defer C.free(unsafe.Pointer(cs))
	handle := C.dlopen(cs, C.RTLD_LAZY)
	if handle == nil {
		e := C.dlerror()
		if e != nil {
			return nil, fmt.Errorf("couldn't load library '%s': %s", file, C.GoString(e))
		}
		return nil, fmt.Errorf("couldn't load library '%s'", file)
	}
	return &dynamicLib{ptr: handle}, nil
}

func (d *dynamicLib) load(name string) (unsafe.Pointer, error) {
	cs := C.CString(name)
	defer C.free(unsafe.Pointer(cs))
	ptr := C.dlsym(d.ptr, cs)
	if ptr == nil {
		e := C.dlerror()
		if e != nil {
			return nil, fmt.Errorf("symbol '%s' not found: %s", name, C.GoString(e))
		}
		return nil, fmt.Errorf("symbol '%s' not found", name)
	}
	return ptr, nil
}

func (d *dynamicLib) close() error {
	if d.ptr == nil {
		return nil
	}
	code := int(C.dlclose(d.ptr))
	if code != 0 {
		return fmt.Errorf("couldn't close library (%d)", code)
	}
	d.ptr = nil
	return nil
}
