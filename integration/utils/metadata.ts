// import * as sizeOf from 'image-size'
import debug from 'debug'
// const sizeOf = require('image-size')
import sharp from 'sharp'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {InputFormat} from '../loaders/index.js'
import path, {basename, extname, join} from 'node:path'

export interface Metadata extends ImageMetadata {
  orientation?: number
  src: string
  width?: number
  height?: number
  format: InputFormat
}
export interface ImageMetadata {
  src: string
  width?: number
  height?: number
  aspectRatio: number | `${number}:${number}` | undefined
  size: number | undefined
  hasAlpha: boolean | undefined
  format: InputFormat
  background: ({r: number; g: number; b: number} | number) | undefined
}

export async function metadata(src: URL | string, data?: Buffer): Promise<Metadata | undefined> {
  // debug('astro-media')('METADATA: ', src)
  // if (typeof src === 'string') {
  //   if (extname(src) === 'svg') {
  //   return {
  //     src: fileURLToPath(src),
  //     format: 'svg'
  //   }
  // } else {
  const file = data || (await fs.readFile(src))

  // const width = 100
  // const height = 100
  // const type = 'jpg'
  // const orientation = 1
  const image = sharp(file)
  const metadata = await image.metadata()
  // console.log(metadata.width, metadata.height)
  const {width, height, format, orientation, size, hasAlpha, background} = metadata
  // const {width, height, type, orientation} = await sizeOf(file)
  const isPortrait = (orientation || 0) >= 5

  // debug('astro-media')('OUTPUT METADATA:', width, height, format, orientation, typeof src)

  // if (!width || !height) {
  //   return undefined
  // }

  return {
    src: fileURLToPath(src),
    width: isPortrait ? height : width,
    height: isPortrait ? width : height,
    aspectRatio: width && height ? (isPortrait ? `${height}:${width}` : `${width}:${height}`) : undefined,
    size: size,
    hasAlpha: hasAlpha,
    background: background,
    format: format as InputFormat,
    orientation
  }
  //   }
  // } else {
  // }
}
