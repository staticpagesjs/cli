# Static Pages / CLI

This package is the static pages generator command-line tool.
It does not bundle **readers** or **writers**, you must install them separately.
Globally installed readers and writers are supported, just set the `NODE_PATH` env variable to point to your global npm packages folder. Run `npm root -g` to find where it is.

Yet another static pages generator?
Yes! Because I browsed the whole jamstack scene, but could not find one which
1. uses MVC pattern
2. can read input from any source (YAML, JSON, front-matter style markdowns, database etc.)
3. can render with any template engine (Twig, ejs, Pug, Mustache etc.)
4. supports incremental builds
5. has a flexible CLI tool (see [@static-pages/cli](https://www.npmjs.com/package/@static-pages/cli) on npm)
6. has a Docker image (see [lionel87/static-pages-js](https://hub.docker.com/repository/docker/lionel87/static-pages-js) on dockerhub)
7. written in JS (preferably TypeScript)
8. easy to extend with JS code
9. learning and using is easy (Gatsby, Hugo, Jekyll, Eleventy etc. are so cool but harder to learn and configure)

And because I wrote a ton of custom static generators before; I tought I can improve the concepts to a point where its (hopefully) useful for others.

## Where should I use this?
This project targets small and medium sized projects. The rendering process tries to be as fast as possible so its also useful when you need performance.

## Documentation
[Visit the project page.](https://staticpagesjs.github.io/)

## Usage
There are two methods of usage:
### Load configuration from a file:
```sh
# staticpages [-c|--config <path>]
```

Example:
```sh
# staticpages --config staticpages.yaml
```

### Set configuration with CLI options:
```sh
# staticpages [-r|--from-reader <package>] [-a|--from-args <JSON-string>] [-w|--to-writer <package>] [-A|--to-args <JSON-string>] [-s|--controller <package>] [-x|--context <JSON-string>]
```

Example:
```sh
# staticpages --from-reader @static-pages/markdown-reader \
              --from-args "{\"cwd\":\"pages\"}" \
              --to-writer @static-pages/twig-writer \
              --to-args "{\"view\":\"content.html.twig\"}" \
              --controller ./controllers/my-pages-controller.js
```

> Notice: The second form only allows to define one route.

## Configuration file format

Can be in JSON or YAML format. It must contain one or more `Route` entries (in array or simply as one object).

A `Route` defines a **data source** (`from`), a **controller** (`controller`) where your data can be transformed and a **destination** (`to`) which will render the final page. \
Additional properties can be added to the `Route`, these properties will be accessible in the `controller` via the `this` context.

Formally:
```ts
interface Route {
    from: {
        reader: string;
        args?: unknown;
    };
    to: {
        writer: string;
        args?: unknown;
    };
    controller: string;
    [additionalProps: string]: unknown;
}
```

The `from` property:
- `from.reader` is a string that resolves to an npm package or a local commonjs module. The module must export a factory function that returns an `Iterable` or an `AsyncIterable`.
- `from.args` is passed to the reader factory function as arguments. If args is not an array, it is converted to an array.

The `to` property:
- `to.writer` is a string that resolves to an npm package or a local commonjs module. The module must export a factory function that returns a `render(data)` function.
- `to.args` is passed to the writer factory function as arguments. If args is not an array, it is converted to an array.

The `controller` property is a string that resolves to an npm package or a local commonjs module.


#### Sample with a single route
```yaml
from:
  reader: @static-pages/markdown-reader
  args:
    cwd: pages
    pattern: **/*.md
to:
  writer: @static-pages/twig-writer
  args:
    view: content.html.twig
    views: path/to/views/folder
    out: path/to/output/folder
controller: ./controllers/my-controller.js
```

#### Sample with multiple routes
```yaml
- from:
    reader: @static-pages/markdown-reader
    args:
      cwd: pages
      pattern: **/*.md
  to:
    writer: @static-pages/twig-writer
    args:
      view: content.html.twig
      views: path/to/views/folder
      out: path/to/output/folder
  controller: ./controllers/my-pages-controller.js
- from:
    reader: @static-pages/yaml-reader
    args:
      cwd: home
      pattern: *.yaml
  to:
    writer: @static-pages/twig-writer
    args:
      view: home.html.twig
      views: path/to/views/folder
      out: path/to/output/folder
  controller: ./controllers/my-home-controller.js
```

> Controllers can be stored along with the *.md/*.yaml/data files in your local repository.

## Missing a feature?
Create an issue describing your needs. If it fits the scope of the project I will implement it or you can implement it your own and submit a pull request.
