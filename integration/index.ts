import type { AstroConfig, AstroIntegration } from "astro";
import { ssgBuild } from "./build/ssg";
import type {
  ImageService,
  SSRImageService,
  TransformOptions,
} from "./loaders/index";
import type { LoggerLevel } from "./utils/logger";
import { joinPaths, prependForwardSlash, propsToFilename } from "./utils/paths";
import { createPlugin } from "./vite-plugin-astro-image";
import { fileURLToPath, pathToFileURL } from "node:url";
// import passthroughLoader from './loaders/passthrough'
import sharpLoader from "./loaders/sharp";
import { metadata } from "./utils/metadata";
import { join, relative, resolve } from "node:path";
import { readFileSync } from "node:fs";
import debug from "debug";

export async function getImageMetadataQuery(path: string) {
  debug("astro-media")("getImageMetadataQuery path", path);
  const imgPath = join(process.cwd(), path);
  // const imgOutPath = relative(process.cwd(), path)
  const imgRelPath = relative(process.cwd(), imgPath);
  debug("astro-media")("getImageMetadataQuery: ", imgPath);
  debug("astro-media")("getImageMetadataQuery relPath", imgRelPath);
  // debug("astro-media")("getImageMetadataQuery outPath", imgOutPath);

  const url = pathToFileURL(imgRelPath);
  const meta = await metadata(url);
  debug("astro-media")(`METADATA: ${typeof meta} ${url}`);
  if (meta) {
    const metaUrl = new URL(`file://${meta.src}`);
    metaUrl.searchParams.append("path", url.toString());
    metaUrl.searchParams.append("meta", JSON.stringify(meta));
    return `${path}${metaUrl.search}`;
  } else {
    debug("astro-media")(`Unable to resolve metadata for file: `, imgPath);
    return "";
  }
}
// export { default as Image } from '../components/Image.astro'
// export { default as Picture } from '../components/Picture.astro'

// declare module Image {
// 	const value: {
// 		(props: {
// 			'src'?: string
// 			'height'?: number | string
// 			'alt'?: string
// 			'width'?: number | string
// 		}): any
// 	}

// 	export { value }
// }
// export type {
// 	ImageComponentLocalImageProps,
// 	ImageComponentRemoteImageProps,
// 	PictureComponentLocalImageProps,
// 	PictureComponentRemoteImageProps,
// 	ImgHTMLAttributes,
// 	warnForMissingAlt } from '../components/index'
export { getImage } from "./lib/get-image";
export { getPicture } from "./lib/get-picture";
// export { metadata } from "./utils/metadata";

const PKG_NAME = "astro-media";
const ROUTE_PATTERN = "/_image";
const UNSUPPORTED_ADAPTERS = new Set([
  "@astrojs/cloudflare",
  "@astrojs/netlify/edge-functions",
  "@astrojs/vercel/edge",
]);

interface BuildConfig {
  client: URL;
  server: URL;
  assets: string;
}

interface ImageIntegration {
  loader?: ImageService;
  defaultLoader: SSRImageService;
  addStaticImage?: (transform: TransformOptions) => string;
}

declare global {
  // eslint-disable-next-line no-var
  var astroImage: ImageIntegration;
}

export interface IntegrationOptions {
  /**
   * Entry point for the @type {HostedImageService} or @type {LocalImageService} to be used.
   */
  serviceEntryPoint?:
    | "@astrojs/image/squoosh"
    | "@astrojs/image/sharp"
    | string;
  logLevel?: LoggerLevel;
  cacheDir?: false | string;
}

export default function integration(
  options: IntegrationOptions = {}
): AstroIntegration {
  const resolvedOptions = {
    serviceEntryPoint: "@astrojs/image/sharp",
    logLevel: "debug" as LoggerLevel,
    cacheDir: "./node_modules/.astro/image",
    ...options,
  };

  let _config: AstroConfig;
  let _buildConfig: BuildConfig;

  // During SSG builds, this is used to track all transformed images required.
  const staticImages = new Map<string, Map<string, TransformOptions>>();

  function getViteConfiguration(isDev: boolean) {
    return {
      plugins: [createPlugin(_config, resolvedOptions)],
      build: {
        rollupOptions: {
          external: ["sharp"],
        },
      },
      ssr: {
        noExternal: ["@astrojs/image", resolvedOptions.serviceEntryPoint],
        // Externalize CJS dependencies used by `serviceEntryPoint`. Vite dev mode has trouble
        // loading these modules with `ssrLoadModule`, but works in build.
        external: isDev ? ["http-cache-semantics", "image-size", "mime"] : [],
      },
      assetsInclude: ["**/*.wasm"],
    };
  }

  return {
    name: PKG_NAME,
    hooks: {
      "astro:config:setup": async ({
        command,
        config,
        updateConfig,
        injectRoute,
      }) => {
        _config = config;
        updateConfig({
          vite: getViteConfiguration(command === "dev"),
        });

        if (command === "dev" || config.output === "server") {
          injectRoute({
            pattern: ROUTE_PATTERN,
            entryPoint: "node_modules/astro-media/integration/endpoint",
          });
        }

        // const { default: defaultLoader } =
        // const {default: defaultLoader} = await import(
        //   resolvedOptions.serviceEntryPoint === '@astrojs/image/sharp' ? './loaders/sharp.js' : './loaders/squoosh.js'
        // )

        globalThis.astroImage = {
          // defaultLoader
          defaultLoader: sharpLoader,
        };
      },
      "astro:config:done": ({ config }) => {
        _config = config;
        _buildConfig = config.build;
      },
      "astro:build:start": () => {
        const adapterName = _config.adapter?.name;
        if (adapterName && UNSUPPORTED_ADAPTERS.has(adapterName)) {
          throw new Error(
            `@astrojs/image is not supported with the ${adapterName} adapter. Please choose a Node.js compatible adapter.`
          );
        }
      },
      "astro:build:setup": async () => {
        // Used to cache all images rendered to HTML
        // Added to globalThis to share the same map in Node and Vite
        function addStaticImage(transform: TransformOptions) {
          const srcTranforms = staticImages.has(transform.src)
            ? staticImages.get(transform.src)!
            : new Map<string, TransformOptions>();

          const filename = propsToFilename(transform);

          srcTranforms.set(filename, transform);
          staticImages.set(transform.src, srcTranforms);

          // Prepend the Astro config's base path, if it was used.
          // Doing this here makes sure that base is ignored when building
          // staticImages to /dist, but the rendered HTML will include the
          // base prefix for `src`.
          return prependForwardSlash(
            joinPaths(_config.base, _buildConfig.assets, filename)
          );
        }

        // Helpers for building static images should only be available for SSG
        if (_config.output === "static") {
          globalThis.astroImage.addStaticImage = addStaticImage;
        }
      },
      "astro:build:generated": async ({ dir }) => {
        // for SSG builds, build all requested image transforms to dist
        const loader = globalThis?.astroImage?.loader;

        if (resolvedOptions.serviceEntryPoint === "@astrojs/image/squoosh") {
          // For the Squoosh service, copy all wasm files to dist/chunks.
          // Because the default loader is dynamically imported (above),
          // Vite will bundle squoosh to dist/chunks and expect to find the wasm files there
          console.error("ERROR: Sqoosh not supported.");
          // await copyWasmFiles(new URL('./chunks', dir));
        }

        if (loader && "transform" in loader && staticImages.size > 0) {
          const cacheDir = !!resolvedOptions.cacheDir
            ? new URL(resolvedOptions.cacheDir, _config.root)
            : undefined;

          await ssgBuild({
            loader,
            staticImages,
            config: _config,
            outDir: dir,
            logLevel: resolvedOptions.logLevel,
            cacheDir,
          });
        }
      },
      "astro:build:ssr": async () => {
        if (resolvedOptions.serviceEntryPoint === "@astrojs/image/squoosh") {
          console.error("ERROR: Sqoosh not supported.");
          // await copyWasmFiles(new URL('./chunks/', _buildConfig.server));
        }
      },
    },
  };
}
