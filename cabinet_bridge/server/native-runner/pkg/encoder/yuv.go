package encoder

// PixelFormat represents Libretro color formats
type PixelFormat int

const (
	PixelFormat0RGB1555 PixelFormat = 0
	PixelFormatXRGB8888 PixelFormat = 1
	PixelFormatRGB565   PixelFormat = 2
)

// YUVBuffer holds pre-allocated memory for Y, U, and V planar buffers
type YUVBuffer struct {
	Width   int
	Height  int
	Data    []byte
	yOffset int
	uOffset int
	vOffset int
}

// NewYUVBuffer pre-allocates contiguous planar memory for WxH YUV420p
func NewYUVBuffer(width, height int) *YUVBuffer {
	// Align to even dimensions
	w := width
	if w%2 != 0 {
		w++
	}
	h := height
	if h%2 != 0 {
		h++
	}

	ySize := w * h
	uvSize := (w / 2) * (h / 2)
	total := ySize + (2 * uvSize)

	return &YUVBuffer{
		Width:   w,
		Height:  h,
		Data:    make([]byte, total),
		yOffset: 0,
		uOffset: ySize,
		vOffset: ySize + uvSize,
	}
}

// ConvertRGBToYUV420p converts source RGB/XRGB buffer into destination planar YUV420p
func (buf *YUVBuffer) ConvertRGBToYUV420p(src []byte, srcFormat PixelFormat) {
	w := buf.Width
	h := buf.Height
	yPlane := buf.Data[buf.yOffset:buf.uOffset]
	uPlane := buf.Data[buf.uOffset:buf.vOffset]
	vPlane := buf.Data[buf.vOffset:]

	halfW := w / 2

	switch srcFormat {
	case PixelFormatXRGB8888:
		for y := 0; y < h; y++ {
			srcRow := y * w * 4
			yRow := y * w
			uRow := (y / 2) * halfW
			for x := 0; x < w; x++ {
				idx := srcRow + (x * 4)
				if idx+3 >= len(src) {
					continue
				}
				// Libretro XRGB8888: Byte 0=B, 1=G, 2=R, 3=X (little-endian)
				b := int(src[idx])
				g := int(src[idx+1])
				r := int(src[idx+2])

				// Standard BT.601 formula in integer arithmetic
				yVal := ((66*r + 129*g + 25*b + 128) >> 8) + 16
				yPlane[yRow+x] = clampUint8(yVal)

				// Subsample U and V for even pixels
				if x%2 == 0 && y%2 == 0 {
					uVal := ((-38*r - 74*g + 112*b + 128) >> 8) + 128
					vVal := ((112*r - 94*g - 18*b + 128) >> 8) + 128
					uvIdx := uRow + (x / 2)
					uPlane[uvIdx] = clampUint8(uVal)
					vPlane[uvIdx] = clampUint8(vVal)
				}
			}
		}

	case PixelFormatRGB565:
		for y := 0; y < h; y++ {
			srcRow := y * w * 2
			yRow := y * w
			uRow := (y / 2) * halfW
			for x := 0; x < w; x++ {
				idx := srcRow + (x * 2)
				if idx+1 >= len(src) {
					continue
				}
				raw := uint16(src[idx]) | (uint16(src[idx+1]) << 8)

				// Extract 5-6-5 channels and scale to 0-255
				r5 := int((raw >> 11) & 0x1F)
				g6 := int((raw >> 5) & 0x3F)
				b5 := int(raw & 0x1F)

				r := (r5 * 527 + 23) >> 6
				g := (g6 * 259 + 33) >> 6
				b := (b5 * 527 + 23) >> 6

				yVal := ((66*r + 129*g + 25*b + 128) >> 8) + 16
				yPlane[yRow+x] = clampUint8(yVal)

				if x%2 == 0 && y%2 == 0 {
					uVal := ((-38*r - 74*g + 112*b + 128) >> 8) + 128
					vVal := ((112*r - 94*g - 18*b + 128) >> 8) + 128
					uvIdx := uRow + (x / 2)
					uPlane[uvIdx] = clampUint8(uVal)
					vPlane[uvIdx] = clampUint8(vVal)
				}
			}
		}
	}
}

func clampUint8(v int) byte {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return byte(v)
}
