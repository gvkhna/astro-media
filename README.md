# @gvkhna/astro-media 📷

> ⚠️ This integration is still experimental/WIP!

Fork of @astro/astro-image designed with more convenience when working with images and vector assets (svgs) in astro. With `astro-media` you should be able to get 0 CLS (Content Layout Shifts).

# Setup

```sh
npm i astro-media
```

`astro.config.mjs`
```js
import media from 'astro-media/integration'

export default defineConfig({
  integrations: [
    // towards the top is better
    media()
  ]
})
```

# Usage

```jsx
import Image from 'astro-media'

<Image src={import('asset.png')}>
```

## Support inline asset path

In an attempt to reduce the following code

```js

import MyImage from 'images/asset.img'
```
```jsx
  <img src={MyImage} ...>
```

Instead you can inline paths so you don't need to track so many variable names in addition to filenames

```jsx
import Image from 'astro-media'

<Image src={import('images/asset.img')}>
```

The file will get resolved as part of the astro asset pipeline and be given a hashed filename, etc.

## Auto fill size attributes

```jsx
<Image src={import('myimage.png')}>
```

Missing attributes (width,height) will get filled in:

```html
<img src="myimage-ocniwroconwroiu.png" width="3242" height="4460">
```

So the browser knows the exact size of the image ahead of time instead of waiting for the image to load and shifting the layout of the page while rendering.

### Scale image automatically

```jsx
<Image src={import('myimage.png')} width="320" />
```

This will aspect-ratio scale the image automatically to a width of 320 and output the final height in the produced html

```html
<img src="image.img" width="320" height="480" />
```

## Inline SVG

Self explanatory but for many tiny svg files the file will be read, inlined and attributed correctly to reduce CLS.

```jsx

<Image src={import('icon.svg')}>
```


## No custom types as opposed to @astro/image

As part of the build system the plugin will annotate the import url with it's metadata in import meta format. As part of communicating build metadata to the Astro component at build/runtime. This is powerful and allows for handling of this metadata without any custom setup to your project.

```js
<Image src={import('myimage.png')}>
```

When the Astro component Image is initialized, it sees the following url

```
myimage.png?width=180&height=220&format=png&size=3200&...
```

All of this metadata is then interpreted so if you have specified one attribute such as only the width, it will use the metadata to aspect ratio scale the image to that width. 

# WIP Status

The core features described work at this time, no testing...

Planned to add better support for Picture component so additional formats such as webp, avif are automatically generated.

As well multiple resolutions are automatically generated for larger images and specified as src-set in the result <img>.

## Building

```sh
pnpm build
npm publish
```

## Debugging

Run this command to see some internal output in case you encounter errors.
`DEBUG=astro-media astro dev`

## Releasing

Bump the version number. Create a new Github Release which will trigger the workflow.

## Contributing

You're welcome to submit an issue or PR!

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a history of changes to this integration.
