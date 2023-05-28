import type {AstroConfig} from 'astro'
import MagicString from 'magic-string'
import debug from 'debug'
import fs from 'node:fs/promises'
import path, {basename, extname, join} from 'node:path'
import {Readable} from 'node:stream'
import {fileURLToPath, pathToFileURL} from 'node:url'
import slash from 'slash'
import type {Plugin, ResolvedConfig} from 'vite'
import type {IntegrationOptions} from './index'
import type {InputFormat} from './loaders/index'
import {metadata} from './utils/metadata'
import type {ImageMetadata} from './utils/metadata'

export function createPlugin(config: AstroConfig, options: Required<IntegrationOptions>): Plugin {
  const filter = (id: string) => /^(?!\/_image?).*.(heic|heif|avif|jpeg|jpg|png|tiff|webp|gif|svg)$/.test(id)

  const virtualModuleId = 'virtual:image-loader'

  let resolvedConfig: ResolvedConfig

  return {
    name: 'astro-media',
    enforce: 'pre',
    configResolved(viteConfig) {
      resolvedConfig = viteConfig
    },
    async resolveId(id) {
      // The virtual model redirects imports to the ImageService being used
      // This ensures the module is available in `astro dev` and is included
      // in the SSR server bundle.
      if (id === virtualModuleId) {
        return await this.resolve(options.serviceEntryPoint)
      }
    },
    async load(id) {
      // only claim image ESM imports
      if (!filter(id)) {
        return null
      }

      const url = pathToFileURL(id)

      const meta = await metadata(url)
      debug('astro-media')(`METADATA: ${typeof meta} ${url}`)
      // console.error(`META: `, meta)
      // throw new Error(`meta is ${meta}`)

      if (!meta) {
        return
      }

      if (!this.meta.watchMode) {
        const pathname = decodeURI(url.pathname)
        const filename = basename(pathname, extname(pathname) + `.${meta.format}`)

        const handle = this.emitFile({
          name: filename,
          source: await fs.readFile(url),
          type: 'asset'
        })

        meta.src = `__ASTRO_IMAGE_ASSET__${handle}__`
      } else {
        const relId = path.relative(fileURLToPath(config.srcDir), id)

        meta.src = join('/@astroimage', relId)

        // Windows compat
        meta.src = slash(meta.src)
      }

      if (meta instanceof String) {
        return `export default "${meta}"`
      } else if (meta instanceof Object) {
        const metaUrl = new URL(`file://${meta.src}`)
        metaUrl.searchParams.append('path', url.toString())
        metaUrl.searchParams.append('meta', JSON.stringify(meta))
        // for (let [k, v] of Object.entries(meta)) {
        //   if (v) {
        //     metaUrl.searchParams.append(k, `${v}`)
        //   }
        // }
        // if (meta.width) {
        //   metaUrl.searchParams.append('width')
        // }
        // if (meta.width && meta.height) {
        //   metaUrl.searchParams.append('width', `${meta.width}`)
        //   metaUrl.searchParams.append('height', `${meta.height}`)
        //   metaUrl.searchParams.append('aspectRatio', `${meta.width}:${meta.height}`)
        // }
        // if (meta.format) {
        //   metaUrl.searchParams.append('format', meta.format)
        // }
        // if (meta.orientation) {
        //   metaUrl.searchParams.append('orientation', `${meta.orientation}`)
        // }
        return `export default "${meta.src}${metaUrl.search}"`
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/@astroimage/')) {
          const [, id] = req.url.split('/@astroimage/')

          const url = new URL(id, config.srcDir)
          const file = await fs.readFile(url)

          const meta = await metadata(url)

          if (!meta) {
            return next()
          }

          const transform = await globalThis.astroImage.defaultLoader.parseTransform(url.searchParams)

          // if no transforms were added, the original file will be returned as-is
          let data = file
          let format = meta.format

          if (transform) {
            const result = await globalThis.astroImage.defaultLoader.transform(file, transform)
            data = result.data
            format = result.format
          }

          res.setHeader('Content-Type', `image/${format}`)
          res.setHeader('Cache-Control', 'max-age=360000')

          const stream = Readable.from(data)
          return stream.pipe(res)
        }

        return next()
      })
    },
    async renderChunk(code) {
      const assetUrlRE = /__ASTRO_IMAGE_ASSET__([a-z\d]{8})__(?:_(.*?)__)?/g

      let match
      let s
      while ((match = assetUrlRE.exec(code))) {
        s = s || (s = new MagicString(code))
        const [full, hash, postfix = ''] = match

        const file = this.getFileName(hash)
        const outputFilepath = resolvedConfig.base + file + postfix

        s.overwrite(match.index, match.index + full.length, outputFilepath)
      }

      if (s) {
        return {
          code: s.toString(),
          map: resolvedConfig.build.sourcemap ? s.generateMap({hires: true}) : null
        }
      } else {
        return null
      }
    }
  }
}
