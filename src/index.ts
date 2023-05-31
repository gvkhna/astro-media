/// <reference types="astro/astro-jsx" />

import type {HTMLAttributes} from 'astro/types'

import type {TransformOptions, OutputFormat} from '../integration/loaders/index'
import type {ImageMetadata} from '../integration/utils/metadata'
import type {AstroBuiltinAttributes} from 'astro'
// @ts-expect-error
import Image from "./Image.astro";
// @ts-expect-error
import Picture from "./Picture.astro";

export {
  Image as default,
  Image,
  Picture
}


export interface ImageComponentLocalImageProps
  extends Omit<TransformOptions, 'src'>,
    Omit<ImgHTMLAttributes, 'src' | 'width' | 'height'> {
  src: Promise<any>
  /** Defines an alternative text description of the image. Set to an empty string (alt="") if the image is not a key part of the content (it's decoration or a tracking pixel). */
  alt: string
}

export interface ImageComponentLocalSVGProps
  extends Omit<TransformOptions, 'src'>,
    Omit<ImgHTMLAttributes, 'src' | 'width' | 'height'> {
  src: Promise<any>
}

export interface ImageComponentRemoteImageProps extends TransformOptions, ImgHTMLAttributes {
  src: string
  /** Defines an alternative text description of the image. Set to an empty string (alt="") if the image is not a key part of the content (it's decoration or a tracking pixel). */
  alt: string
  format?: OutputFormat
  width: number
  height: number
}

export interface PictureComponentLocalImageProps
  extends GlobalHTMLAttributes,
    Omit<TransformOptions, 'src'>,
    Pick<ImgHTMLAttributes, 'loading' | 'decoding'> {
  src: Promise<any>
  /** Defines an alternative text description of the image. Set to an empty string (alt="") if the image is not a key part of the content (it's decoration or a tracking pixel). */
  alt: string
  sizes: HTMLImageElement['sizes']
  widths: number[]
  formats?: OutputFormat[]
}

export interface PictureComponentRemoteImageProps
  extends GlobalHTMLAttributes,
    TransformOptions,
    Pick<ImgHTMLAttributes, 'loading' | 'decoding'> {
  src: string
  /** Defines an alternative text description of the image. Set to an empty string (alt="") if the image is not a key part of the content (it's decoration or a tracking pixel). */
  alt: string
  sizes: HTMLImageElement['sizes']
  widths: number[]
  aspectRatio: TransformOptions['aspectRatio']
  formats?: OutputFormat[]
  background: TransformOptions['background']
}

export type ImgHTMLAttributes = HTMLAttributes<'img'>

export type GlobalHTMLAttributes = Omit<astroHTML.JSX.HTMLAttributes, keyof Omit<AstroBuiltinAttributes, 'class:list'>>

let altWarningShown = false

export async function resolveSrcAttr(propSrc: Promise<any> | string) {
  let src: string | null | undefined = undefined

  if (typeof propSrc === 'string') {
    src = propSrc
  }
  if (propSrc && propSrc instanceof Promise) {
    let p = await propSrc
    if (p.hasOwnProperty('default') && p.default) {
      src = p.default
    }
  }
  return src
}

export function warnForMissingAlt() {
  if (altWarningShown === true) {
    return
  }

  altWarningShown = true

  console.warn(`\n[@astrojs/image] "alt" text was not provided for an <Image> or <Picture> component.

A future release of @astrojs/image may throw a build error when "alt" text is missing.

The "alt" attribute holds a text description of the image, which isn't mandatory but is incredibly useful for accessibility. Set to an empty string (alt="") if the image is not a key part of the content (it's decoration or a tracking pixel).\n`)
}
