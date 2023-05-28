/// <reference types="astro/astro-jsx" />
// import mime from 'mime';
import {OutputFormat, parseAspectRatio, TransformOptions} from '../loaders/index'
import {extname} from '../utils/paths'
import {ImageMetadata} from '../utils/metadata'
import {getImage} from './get-image'

export interface GetPictureParams {
  src: string | ImageMetadata | Promise<{default: ImageMetadata}>
  alt: string
  widths: number[]
  formats: OutputFormat[]
  aspectRatio?: TransformOptions['aspectRatio']
  fit?: TransformOptions['fit']
  background?: TransformOptions['background']
  position?: TransformOptions['position']
}

export interface GetPictureResult {
  image: astroHTML.JSX.HTMLAttributes
  sources: {type: string; srcset: string}[]
}

async function resolveAspectRatio({src, aspectRatio}: GetPictureParams) {
  if (typeof src === 'string') {
    return parseAspectRatio(aspectRatio)
  } else {
    const metadata = 'then' in src ? (await src).default : src
    if (metadata.width && metadata.height) {
      return parseAspectRatio(aspectRatio) || metadata.width / metadata.height
    }
  }
}

async function resolveFormats({src, formats}: GetPictureParams) {
  const unique = new Set(formats)

  if (typeof src === 'string') {
    unique.add(extname(src).replace('.', '') as OutputFormat)
  } else {
    const metadata = 'then' in src ? (await src).default : src
    unique.add(extname(metadata.src).replace('.', '') as OutputFormat)
  }

  return Array.from(unique).filter(Boolean)
}

export async function getPicture(moduleImportUrl: string, params: GetPictureParams): Promise<GetPictureResult> {
  const {src, alt, widths, fit, position, background} = params

  if (!src) {
    throw new Error('[@astrojs/image] `src` is required')
  }

  if (!widths || !Array.isArray(widths)) {
    throw new Error('[@astrojs/image] at least one `width` is required')
  }

  try {
    const parsedUrl = new URL(`file://${params.src}`)
    const width = parsedUrl.searchParams.get('w')
    const height = parsedUrl.searchParams.get('h')
    if (!params.aspectRatio && width !== null && height !== null) {
      const w = parseInt(width, 10)
      const h = parseInt(height, 10)
      params.aspectRatio = `${w}:${h}`
    }
  } catch (e) {
    console.error(`ERROR: Image ${params.src} attributes malformed`)
  }

  const aspectRatio = await resolveAspectRatio(params)

  if (!aspectRatio) {
    throw new Error('`aspectRatio` must be provided for remote images')
  }

  // always include the original image format
  const allFormats = await resolveFormats(params)
  const lastFormat = allFormats[allFormats.length - 1]
  const maxWidth = Math.max(...widths)

  let image: astroHTML.JSX.ImgHTMLAttributes

  async function getSource(format: OutputFormat) {
    const imgs = await Promise.all(
      widths.map(async (width) => {
        const img = await getImage(moduleImportUrl, {
          src,
          alt,
          format,
          width,
          fit,
          position,
          background,
          aspectRatio
        })

        if (format === lastFormat && width === maxWidth) {
          image = img
        }

        return `${img.src} ${width}w`
      })
    )

    return {
      type: format,
      srcset: imgs.join(',')
    }
  }

  const sources = await Promise.all(allFormats.map((format) => getSource(format)))

  return {
    sources,
    // @ts-expect-error image will always be defined
    image
  }
}
