/// <reference types="astro/astro-jsx" />
import fs from 'node:fs/promises'
import * as cheerio from 'cheerio'
// import { JSDOM } from 'jsdom'
import {XMLParser} from 'fast-xml-parser'
import type {ColorDefinition, ImageService, OutputFormat, TransformOptions} from '../loaders/index'
import {isSSRService, parseAspectRatio} from '../loaders/index'
import {isRemoteImage} from '../utils/paths'
import type {ImageMetadata} from '../utils/metadata'
// import passthroughLoader from '../loaders/passthrough'
import sharpLoader from '../loaders/sharp'
import debug from 'debug'

export interface GetImageTransform extends Omit<TransformOptions, 'src'> {
  src: string | ImageMetadata | Promise<{default: ImageMetadata}>
  alt: string
}

function parseImageFileMetadata(moduleImportURL: string): ImageMetadata | undefined {
  let metadata = undefined
  try {
    const parsedUrl = new URL(`file://${moduleImportURL}`)
    const metaStr = parsedUrl.searchParams.get('meta')
    if (metaStr) {
      const meta = JSON.parse(metaStr)
      metadata = meta as ImageMetadata
    }
  } catch (e) {
    console.error(`ERROR: Image ${moduleImportURL} metadata malformed`)
  }
  return metadata
}

export function getImageType(moduleImportURL: string) {
  const metadata = parseImageFileMetadata(moduleImportURL)
  if (metadata) {
    return metadata.format
  }
}

export async function getSVGAttributes(moduleImportURL: string, props: any): Promise<astroHTML.JSX.SVGAttributes> {
  let metaWidth: number | undefined = undefined
  let metaHeight: number | undefined = undefined
  debug('astro-media')(`svg-metadata: ${moduleImportURL}`)
  const meta = parseImageFileMetadata(moduleImportURL)
  metaWidth = meta?.width
  metaHeight = meta?.height

  let transformMap = new Map()

  const fileData = await getImageFile(moduleImportURL)
  if (fileData) {
    const options = {
      ignoreAttributes: false,
      allowBooleanAttributes: true,
      processEntities: true,
      ignoreDeclaration: true,
      ignorePiTags: true,
      attributeNamePrefix: '@_'
    }

    const parser = new XMLParser(options)
    let jsonObj = parser.parse(fileData)
    debug('astro-media')(`svg: ${JSON.stringify(jsonObj)}`)

    const svgFilterAttributes = ['xmlns', 'version', 'xmlns:xlink']

    let svgNode = jsonObj['svg']
    if (svgNode && svgNode instanceof Object) {
      debug('astro-media')(`keys: ${Object.keys(svgNode)}`)
      for (let svgPropKey in svgNode) {
        let svgProp = svgNode[svgPropKey]
        if (svgPropKey.startsWith('@_')) {
          let svgAttributeKey = svgPropKey.replace('@_', '')
          if (svgFilterAttributes.indexOf(svgAttributeKey) < 0) {
            transformMap.set(svgAttributeKey, svgProp)
          }
        }
      }
    }

    debug('astro-media')(`transform: ${JSON.stringify(transformMap)}`)
  } else {
    debug('astro-media')('svg file', moduleImportURL, 'not found')
  }

  let {width: propsWidth, height: propsHeight} = props

  const svgFilterProps = ['src', 'alt']
  for (let propKey in props) {
    if (svgFilterProps.indexOf(propKey) < 0) {
      transformMap.set(propKey, props[propKey])
    }
  }

  let transform: astroHTML.JSX.SVGAttributes = Object.fromEntries(transformMap)
  if (metaWidth !== undefined && metaHeight !== undefined) {
    if (!isNaN(metaWidth) && !isNaN(metaHeight)) {
      const aspectRatio = metaWidth / metaHeight
      if (propsWidth && !propsHeight) {
        transform.width = propsWidth
        transform.height = Math.round(propsWidth / aspectRatio)
      } else if (propsHeight && !propsWidth) {
        transform.height = propsHeight
        transform.width = Math.round(aspectRatio * propsHeight)
      } else if (propsWidth && propsHeight) {
        transform.width = propsWidth
        transform.height = propsHeight
      } else {
        // take width/height from viewbox if exists
      }
    }
  }

  return transform
}

export async function getSVGInnerHtml(moduleImportURL: string) {
  const fileData = await getImageFile(moduleImportURL)
  if (fileData) {
    const $ = cheerio.load(fileData)
    return $('svg').html()
  }
}

async function getImageFile(moduleImportURL: string) {
  let filePath: string | undefined = undefined
  try {
    const parsedUrl = new URL(`file://${moduleImportURL}`)
    const metaPath = parsedUrl.searchParams.get('path')
    if (metaPath !== null) {
      filePath = metaPath
    }
  } catch (e) {
    debug('astro-media')('getImageFile failed!')
  }

  if (filePath) {
    const url = new URL(filePath)
    debug('astro-media')(`loading url ${typeof url}`)
    return await fs.readFile(url)
  }
}

function retinaScaleTransform(transforms: TransformOptions, scale: number): TransformOptions {
  let {width, height, ...rest} = transforms
  if (!width || !height) {
    throw new Error(`Error parsing transforms for ${transforms.src}`)
  }
  return {
    ...rest,
    width: width * scale,
    height: height * scale
  }
}

function resolveTransform(metadata: ImageMetadata, transforms: GetImageTransform): TransformOptions {
  let {width, height, aspectRatio, background, format = metadata.format, ...rest} = transforms

  if (!width && !height) {
    // neither dimension was provided, use the file metadata
    width = metadata.width
    height = metadata.height
  } else if (width && metadata.width && metadata.height) {
    // one dimension was provided, calculate the other
    let ratio = parseAspectRatio(aspectRatio) || metadata.width / metadata.height
    height = height || Math.round(width / ratio)
  } else if (height && metadata.width && metadata.height) {
    // one dimension was provided, calculate the other
    let ratio = parseAspectRatio(aspectRatio) || metadata.width / metadata.height
    width = width || Math.round(height * ratio)
  }

  return {
    ...rest,
    src: metadata.src,
    width,
    height,
    aspectRatio,
    format: format as OutputFormat,
    background: background as ColorDefinition | undefined
  }
}

export async function getImage(
  moduleImportURL: string,
  transforms: GetImageTransform,
  isSvg = false
): Promise<astroHTML.JSX.ImgHTMLAttributes> {
  const imageFileMetadata = parseImageFileMetadata(moduleImportURL)

  if (!imageFileMetadata) {
    throw new Error(`@astrojs/image: Image metadata not found for ${moduleImportURL}!`)
  }
  const resolved = resolveTransform(imageFileMetadata, transforms)

  const loader = sharpLoader

  // // `.env` must be optional to support running in environments outside of `vite` (such as `astro.config`)
  // // @ts-ignore
  const isDev = import.meta.env?.DEV
  const isLocalImage = !isRemoteImage(moduleImportURL)

  const _loader = isDev && isLocalImage ? globalThis.astroImage.defaultLoader : loader

  debug('astro-media')(`Loader: ${_loader.name()} being utilized`)
  if (!_loader) {
    throw new Error('@astrojs/image: loader not found!')
  }

  const {searchParams} = isSSRService(_loader)
    ? _loader.serializeTransform(resolved)
    : globalThis.astroImage.defaultLoader.serializeTransform(resolved)

  const {searchParams: searchParams2x} = isSSRService(_loader)
    ? _loader.serializeTransform(retinaScaleTransform(resolved, 2))
    : globalThis.astroImage.defaultLoader.serializeTransform(retinaScaleTransform(resolved, 2))

  const {searchParams: searchParams3x} = isSSRService(_loader)
    ? _loader.serializeTransform(retinaScaleTransform(resolved, 3))
    : globalThis.astroImage.defaultLoader.serializeTransform(retinaScaleTransform(resolved, 3))

  const imgSrc = !isLocalImage && resolved.src.startsWith('//') ? `https:${resolved.src}` : resolved.src

  debug('astro-media')('Image Src Resolved: ', imgSrc)
  let src: string
  let srcset: string
  if (/^[\/\\]?_astro/.test(imgSrc)) {
    // production
    src = `${imgSrc}`
    // srcset = `${imgSrc} 2x,${imgSrc} 3x`
  } else if (/^[\/\\]?_astro/.test(imgSrc)) {
    src = `${imgSrc}?${searchParams.toString()}`
  } else {
    searchParams.set('href', imgSrc)
    src = `/_image?${searchParams.toString()}`
    // srcset = `/_image?${searchParams2x.toString()} 2x, /_image?${searchParams3x.toString()} 3x`
  }

  // // cache all images rendered to HTML
  if (globalThis.astroImage?.addStaticImage) {
    src = globalThis.astroImage.addStaticImage(resolved)
  }

  if (isSvg) {
    return {
      class: (resolved as any)?.class,
      width: resolved.width,
      height: resolved.height,
      alt: (resolved as any).alt,
      src
    }
  } else {
    return {
      class: (resolved as any)?.class,
      width: resolved.width,
      height: resolved.height,
      alt: (resolved as any).alt,
      src,
      // srcset,
      loading: (resolved as any)?.loading,
      crossorigin: (resolved as any)?.crossorigin,
      sizes: (resolved as any)?.sizes,
      referrerpolicy: (resolved as any)?.referrerpolicy
    }
  }
  
}
