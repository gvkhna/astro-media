import type { APIRoute } from 'astro';
import mime from 'mime';
// @ts-ignore
// import loader from 'virtual:image-loader';
import { etag } from './utils/etag';
import { isRemoteImage } from './utils/paths';
import passthroughLoader from './loaders/passthrough'

async function loadRemoteImage(src: URL) {
	try {
		const res = await fetch(src);

		if (!res.ok) {
			return undefined;
		}

		return Buffer.from(await res.arrayBuffer());
	} catch (err: unknown) {
		console.error(err);
		return undefined;
	}
}

export const get: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url);
		const transform = passthroughLoader.parseTransform(url.searchParams);

		let inputBuffer: Buffer | undefined = undefined;

		if (!transform) {
			return new Response(undefined, {
				status: 404
			})
		}

		// TODO: handle config subpaths?
		const sourceUrl = isRemoteImage(transform.src)
			? new URL(transform.src)
			: new URL(transform.src, url.origin);
		inputBuffer = await loadRemoteImage(sourceUrl);

		if (!inputBuffer) {
			return new Response('Not Found', { status: 404 });
		}

		const { data, format } = await passthroughLoader.transform(inputBuffer, transform);

		return new Response(data, {
			status: 200,
			headers: {
				'Content-Type': mime.getType(format) || '',
				'Cache-Control': 'public, max-age=31536000',
				ETag: etag(data.toString()),
				Date: new Date().toUTCString(),
			},
		});
	} catch (err: unknown) {
		console.error(err);
		return new Response(`Server Error: ${err}`, { status: 500 });
	}
};
