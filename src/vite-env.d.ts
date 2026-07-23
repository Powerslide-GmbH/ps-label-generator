/// <reference types="vite/client" />

declare module 'utif' {
  export function decode(buffer: ArrayBuffer | Buffer): Array<{
    width: number
    height: number
    data?: Uint8Array
  }>
  export function decodeImage(
    buffer: ArrayBuffer | Buffer,
    ifd: { width: number; height: number },
  ): void
  export function toRGBA8(ifd: {
    width: number
    height: number
  }): Uint8Array
}

declare module '@pdf-lib/fontkit' {
  const fontkit: {
    create: (buffer: Uint8Array | ArrayBuffer) => unknown
  }
  export default fontkit
}
